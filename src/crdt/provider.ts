import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import { Event, UnsignedEvent, Relay, type VerifiedEvent } from 'nostr-tools';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { SyncProvider, NostrSyncConfig, NostrUpdateMessage } from './types.js';

/**
 * Parse the required NIP-13 difficulty out of a relay's PoW rejection.
 *
 * Cloistr's relay emits "pow: ... (got N, need M)" for both the global gate and the
 * per-trust-level WoT gate. Returns the required bit count M, or null if the error is
 * not a PoW rejection (in which case the caller must not retry). Tolerant of the reason
 * being wrapped in an Error, a bare string, or the "reason" field of a relay OK frame.
 */
export function parsePoWRequirement(error: unknown): number | null {
  const msg =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : error && typeof (error as { reason?: unknown }).reason === 'string' ? (error as { reason: string }).reason
    : '';
  if (!/^\s*pow:/i.test(msg) && !/proof of work/i.test(msg)) {
    return null;
  }
  const m = msg.match(/need\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Detect a NIP-42 rejection.
 *
 * Per NIP-01 a relay refuses an event it wants authentication for with an OK
 * frame whose reason is machine-readable-prefixed `auth-required:`. Cloistr's
 * relay sends exactly:
 *
 *   auth-required: authentication required to publish events
 *
 * Same shape as the `pow:` prefix above, so it gets the same treatment: publish,
 * and only authenticate if the relay actually asks. Note the prefix is checked
 * rather than the prose, which is relay-specific and not contractual.
 */
export function isAuthRequired(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : error && typeof (error as { reason?: unknown }).reason === 'string' ? (error as { reason: string }).reason
    : '';
  return /^\s*auth-required:/i.test(msg);
}

/**
 * Browser+Node-safe base64 for Yjs updates. Node's `Buffer` is not defined in
 * the browser (surfaced as "ReferenceError: Buffer is not defined" in NostrSync
 * when the provider flushed an update), so encode/decode via btoa/atob with
 * chunking to avoid blowing the call stack on large binary updates.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // 32k chars per apply() to stay within arg limits
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Nostr-based sync provider for Yjs documents
 * Uses ephemeral events (kind 25000-29999) for real-time collaboration
 */
export class NostrSyncProvider implements SyncProvider {
  private doc: Y.Doc;
  private config: NostrSyncConfig;
  private relay: Relay | null = null;
  private isConnected = false;
  private peers = new Set<string>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageBuffer: Uint8Array[] = [];
  private lastHeartbeat = 0;
  private pubkey: string | null = null;

  // Event kind for collaborative updates (ephemeral)
  private static readonly UPDATE_KIND = 25078; // Ephemeral collab update
  private static readonly HEARTBEAT_KIND = 25079; // Ephemeral presence heartbeat

  // Yjs awareness (presence/cursors). Editor bindings that add live-cursor
  // support — TipTap CollaborationCursor (docs) and y-excalidraw (whiteboard) —
  // dereference `provider.awareness.setLocalStateField`/`.getStates()` the
  // moment they mount. NostrSyncProvider previously had no awareness, so those
  // bindings crashed ("provider.awareness is undefined" / "this.awareness is
  // undefined"). Expose a real Awareness so the provider is a drop-in for the
  // y-websocket-like interface those bindings expect. (Remote presence sync
  // over Nostr is a follow-up; a local instance is enough to stop the crash and
  // drive single-user local awareness.)
  public readonly awareness: Awareness;

  // Event handlers
  public onUpdate?: (update: Uint8Array, origin: any) => void;
  public onConnect?: () => void;
  public onDisconnect?: () => void;
  public onPeersChange?: (peerCount: number) => void;
  public onError?: (error: Error) => void;

  constructor(doc: Y.Doc, config: NostrSyncConfig) {
    this.doc = doc;
    this.config = {
      connectionTimeout: 5000,
      persist: true,
      ...config,
    };
    this.awareness = new Awareness(this.doc);

    // Listen for document updates to broadcast
    this.doc.on('update', this.handleLocalUpdate.bind(this));

    // Start heartbeat for peer discovery
    this.startHeartbeat();
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get peerCount(): number {
    return this.peers.size;
  }

  async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        return;
      }

      // Get pubkey from signer
      this.pubkey = await this.config.signer.getPublicKey();
      console.log(`[NostrSync] Authenticated as: ${this.pubkey.slice(0, 8)}...`);

      console.log(`[NostrSync] Connecting to relay: ${this.config.relayUrl}`);

      this.relay = await Relay.connect(this.config.relayUrl);

      // Connection successful
      console.log(`[NostrSync] Connected to ${this.config.relayUrl}`);
      this.isConnected = true;
      this.onConnect?.();
      this.subscribeToUpdates();
      this.flushMessageBuffer();

      // Handle close event
      this.relay.onclose = () => {
        console.log(`[NostrSync] Disconnected from ${this.config.relayUrl}`);
        this.isConnected = false;
        this.onDisconnect?.();
        this.scheduleReconnect();
      };

    } catch (error) {
      console.error(`[NostrSync] Connection failed:`, error);
      this.onError?.(error as Error);
      this.scheduleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.relay) {
      await this.relay.close();
      this.relay = null;
    }

    this.isConnected = false;
    this.peers.clear();
  }

  async sendUpdate(update: Uint8Array): Promise<void> {
    if (!this.isConnected || !this.relay) {
      // Buffer updates when disconnected
      this.messageBuffer.push(update);
      return;
    }

    try {
      const message: NostrUpdateMessage = {
        docId: this.config.docId,
        update: bytesToBase64(update),
        timestamp: Date.now(),
        sender: this.getClientId(),
        room: this.config.roomPubkey,
      };

      await this.publishWithPoWRetry(
        NostrSyncProvider.UPDATE_KIND,
        JSON.stringify(message),
        this.getEventTags()
      );

    } catch (error) {
      console.error('[NostrSync] Failed to send update:', error);
      this.onError?.(error as Error);
    }
  }

  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.handleLocalUpdate);
    this.awareness.destroy();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
  }

  private async handleLocalUpdate(update: Uint8Array, origin: any): Promise<void> {
    // Don't broadcast updates that came from the network
    if (origin === this) {
      return;
    }

    await this.sendUpdate(update);
  }

  private subscribeToUpdates(): void {
    if (!this.relay) return;

    const filter = {
      kinds: [NostrSyncProvider.UPDATE_KIND, NostrSyncProvider.HEARTBEAT_KIND],
      '#d': [this.config.docId],
      since: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
    };

    // Add room filter if specified
    if (this.config.roomPubkey) {
      (filter as any)['#r'] = [this.config.roomPubkey];
    }

    console.log('[NostrSync] Subscribing to updates with filter:', filter);

    this.relay.subscribe([filter], {
      onevent: (event: Event) => {
        this.handleRemoteEvent(event);
      },
      oneose: () => {
        console.log('[NostrSync] Initial sync complete');
      },
    });
  }

  private async handleRemoteEvent(event: Event): Promise<void> {
    try {
      // Skip our own events
      if (event.pubkey === this.getClientId()) {
        return;
      }

      if (event.kind === NostrSyncProvider.UPDATE_KIND) {
        const message: NostrUpdateMessage = JSON.parse(event.content);

        if (message.docId !== this.config.docId) {
          return; // Wrong document
        }

        const updateData = base64ToBytes(message.update);

        // Apply the remote update
        Y.applyUpdate(this.doc, updateData, this);

        // Track peer
        this.peers.add(message.sender);
        this.onPeersChange?.(this.peers.size);

        // Notify listeners
        this.onUpdate?.(updateData, this);

      } else if (event.kind === NostrSyncProvider.HEARTBEAT_KIND) {
        // Handle peer presence heartbeat
        const data = JSON.parse(event.content);
        if (data.docId === this.config.docId) {
          this.peers.add(event.pubkey);
          this.onPeersChange?.(this.peers.size);
        }
      }

    } catch (error) {
      console.error('[NostrSync] Failed to handle remote event:', error);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = 1000 + Math.random() * 2000; // 1-3 second delay
    console.log(`[NostrSync] Scheduling reconnect in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('[NostrSync] Reconnection failed:', error);
      });
    }, delay);
  }

  private async flushMessageBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0) {
      return;
    }

    console.log(`[NostrSync] Flushing ${this.messageBuffer.length} buffered updates`);

    for (const update of this.messageBuffer) {
      await this.sendUpdate(update);
    }

    this.messageBuffer = [];
  }

  private startHeartbeat(): void {
    const sendHeartbeat = async () => {
      if (this.isConnected && this.relay && Date.now() - this.lastHeartbeat > 30000) {
        try {
          const heartbeat = {
            docId: this.config.docId,
            timestamp: Date.now(),
            peerCount: this.peers.size,
          };

          await this.publishWithPoWRetry(
            NostrSyncProvider.HEARTBEAT_KIND,
            JSON.stringify(heartbeat),
            this.getEventTags()
          );
          this.lastHeartbeat = Date.now();

        } catch (error) {
          console.error('[NostrSync] Heartbeat failed:', error);
        }
      }
    };

    // Send heartbeat every 30 seconds
    setInterval(sendHeartbeat, 30000);
  }

  // Hard ceiling on PoW difficulty we will mine, even if a relay asks for more. NIP-13
  // is O(2^bits): 8 bits is ~256 hashes (imperceptible), but an unbounded or hostile
  // relay must not be able to make us burn the CPU. ~22 bits ≈ 4M hashes is already
  // seconds; beyond that we refuse rather than hang.
  private static readonly MAX_POW_DIFFICULTY = 24;

  // powDifficulty overrides this.config.powDifficulty for a single event, used by the
  // retry-on-reject path to mine to the exact difficulty the relay demanded.
  private async createEvent(
    kind: number,
    content: string,
    tags: string[][],
    powDifficulty?: number
  ): Promise<Event> {
    if (!this.pubkey) {
      throw new Error('Not authenticated - pubkey not available');
    }

    let eventTags = [...tags];
    let created_at = Math.floor(Date.now() / 1000);

    // Add NIP-13 PoW if required. The explicit override (from a relay rejection) wins
    // over the configured default; either way we cap the work we are willing to do.
    const target = powDifficulty ?? this.config.powDifficulty ?? 0;
    if (target > 0) {
      const result = await this.computePoW(
        kind,
        content,
        eventTags,
        target,
        created_at
      );
      // The committed difficulty MUST be the TARGET we mined against, not the
      // difficulty we happened to achieve.
      //
      // computePoW hashes the event with ['nonce', n, target] to find its nonce.
      // Attaching ['nonce', n, achieved] instead changes the tag, which changes
      // the serialization, which changes the event ID -- so the relay hashes an
      // event that was never mined and measures essentially random difficulty.
      // Observed live: client logged "PoW found: nonce=139, difficulty=9" and the
      // relay rejected the same event with "pow: low trust requires proof of work
      // (got 1, need 8)". Every collaborative publish failed this way.
      //
      // NIP-13 defines the third element as the target commitment anyway, so this
      // is also what the spec asks for.
      eventTags.push(['nonce', result.nonce.toString(), target.toString()]);
      // Use the same created_at that was used for PoW computation
      created_at = result.created_at;
    }

    const unsignedEvent: UnsignedEvent = {
      kind,
      created_at,
      tags: eventTags,
      content,
      pubkey: this.pubkey,
    };

    return await this.config.signer.signEvent(unsignedEvent);
  }

  /**
   * Publish an event, transparently satisfying a relay's NIP-13 proof-of-work demand.
   *
   * WoT relays gate low-trust pubkeys behind per-trust-level PoW (e.g. Cloistr's relay
   * requires 8 bits for unknown keys). The required difficulty is per-pubkey and served
   * only on rejection — it cannot be read ahead of time from NIP-11 — so the correct
   * pattern is: publish, and if rejected with a "pow: ... need N" reason, mine to N and
   * republish. At 8 bits this is ~256 hashes, imperceptible to the user.
   *
   * This is why no PoW is done up front by default: most events to most relays need
   * none, so we pay the (tiny) cost only when a relay actually asks.
   */
  private async publishWithPoWRetry(kind: number, content: string, tags: string[][]): Promise<void> {
    const relay = this.relay;
    if (!relay) {
      throw new Error('Not connected - relay unavailable');
    }
    const event = await this.createEvent(kind, content, tags);
    try {
      await relay.publish(event);
      return;
    } catch (error) {
      // NIP-42: the relay will only say it wants auth when we try to publish,
      // so authenticate on demand and retry once. Without this, every publish
      // to an auth-gated relay fails — which is what silently broke whiteboard
      // saves and the space contacts import (observed 2026-08-02: the relay
      // answered "auth-required: authentication required to publish events"
      // and nothing ever responded to the challenge).
      if (isAuthRequired(error)) {
        await this.authenticate();
        await relay.publish(event);
        return;
      }
      const needed = parsePoWRequirement(error);
      if (needed === null) {
        throw error; // Neither an auth nor a PoW rejection — surface unchanged.
      }
      if (needed > NostrSyncProvider.MAX_POW_DIFFICULTY) {
        throw new Error(
          `relay demands ${needed}-bit PoW, above the client cap of ` +
            `${NostrSyncProvider.MAX_POW_DIFFICULTY}; refusing to mine`
        );
      }
      // Re-mine to the exact difficulty the relay asked for, then retry once.
      const mined = await this.createEvent(kind, content, tags, needed);
      try {
        await relay.publish(mined);
      } catch (retryError) {
        // A relay can gate on both: PoW first, then auth. Handle that ordering
        // rather than failing on the second gate after clearing the first.
        if (!isAuthRequired(retryError)) throw retryError;
        await this.authenticate();
        await relay.publish(mined);
      }
    }
  }

  /**
   * Respond to a NIP-42 AUTH challenge.
   *
   * nostr-tools stores the relay's challenge on the connection and builds the
   * kind-22242 event; we only supply the signature, using the same signer that
   * signs document updates. Signing is delegated (NIP-46 bunker in production),
   * so this is the one place the user's key is asked to prove identity to the
   * relay — it never leaves the signer.
   */
  private async authenticate(): Promise<void> {
    const relay = this.relay;
    if (!relay) {
      throw new Error('Not connected - relay unavailable');
    }
    if (!this.pubkey) {
      throw new Error('Not authenticated - pubkey not available');
    }
    const pubkey = this.pubkey;
    const signer = this.config.signer;
    await relay.auth(async (authEvent) => {
      // nostr-tools hands us an EventTemplate (no pubkey); the signer wants a
      // full UnsignedEvent, so attach the identity we already authenticated as.
      const signed = await signer.signEvent({ ...authEvent, pubkey });
      // nostr-tools brands events it verified itself with an internal symbol.
      // Our signer returns a genuinely signed event without that marker, and
      // the relay verifies the signature regardless — so the cast asserts the
      // brand, not the validity.
      return signed as VerifiedEvent;
    });
    console.log('[NostrSync] Completed NIP-42 AUTH');
  }

  /**
   * Compute NIP-13 proof of work
   * Finds a nonce that results in event ID with required leading zero bits
   */
  private async computePoW(
    kind: number,
    content: string,
    tags: string[][],
    targetDifficulty: number,
    created_at: number
  ): Promise<{ nonce: number; difficulty: number; created_at: number }> {
    let nonce = 0;
    const maxIterations = 10_000_000; // Prevent infinite loop

    while (nonce < maxIterations) {
      const testTags = [...tags, ['nonce', nonce.toString(), targetDifficulty.toString()]];

      // Compute event hash (ID) for this nonce
      const eventForHash = [
        0,
        this.pubkey,
        created_at,
        kind,
        testTags,
        content,
      ];
      const serialized = JSON.stringify(eventForHash);
      const hashBytes = sha256(new TextEncoder().encode(serialized));
      const hashHex = bytesToHex(hashBytes);

      // Count leading zero bits
      const leadingZeroBits = this.countLeadingZeroBits(hashHex);

      if (leadingZeroBits >= targetDifficulty) {
        console.log(`[NostrSync] PoW found: nonce=${nonce}, difficulty=${leadingZeroBits}`);
        return { nonce, difficulty: leadingZeroBits, created_at };
      }

      nonce++;
      // Yield to event loop every 10000 iterations
      if (nonce % 10000 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    throw new Error(`Could not find PoW solution within ${maxIterations} iterations`);
  }

  /**
   * Count leading zero bits in a hex string
   */
  private countLeadingZeroBits(hex: string): number {
    let bits = 0;
    for (const char of hex) {
      const nibble = parseInt(char, 16);
      if (nibble === 0) {
        bits += 4;
      } else {
        // Count leading zeros in this nibble
        if (nibble < 2) bits += 3;
        else if (nibble < 4) bits += 2;
        else if (nibble < 8) bits += 1;
        break;
      }
    }
    return bits;
  }

  private getEventTags(): string[][] {
    const tags: string[][] = [
      ['d', this.config.docId], // Document identifier
    ];

    if (this.config.roomPubkey) {
      tags.push(['r', this.config.roomPubkey]); // Room identifier
    }

    tags.push(['client', 'cloistr-collab']); // Client identifier

    return tags;
  }

  private getClientId(): string {
    if (!this.pubkey) {
      throw new Error('Not authenticated - pubkey not available');
    }
    return this.pubkey;
  }
}

/**
 * Factory function to create a Nostr sync provider
 */
export function createNostrSyncProvider(
  doc: Y.Doc,
  config: NostrSyncConfig
): NostrSyncProvider {
  return new NostrSyncProvider(doc, config);
}