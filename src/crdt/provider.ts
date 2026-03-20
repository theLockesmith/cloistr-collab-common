import * as Y from 'yjs';
import { Event, finalizeEvent, UnsignedEvent, Relay } from 'nostr-tools';
import { SyncProvider, NostrSyncConfig, NostrUpdateMessage } from './types.js';

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

  // Event kind for collaborative updates (ephemeral)
  private static readonly UPDATE_KIND = 25078; // Ephemeral collab update
  private static readonly HEARTBEAT_KIND = 25079; // Ephemeral presence heartbeat

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
        update: Buffer.from(update).toString('base64'),
        timestamp: Date.now(),
        sender: this.getClientId(),
        room: this.config.roomPubkey,
      };

      const event = await this.createEvent(
        NostrSyncProvider.UPDATE_KIND,
        JSON.stringify(message),
        this.getEventTags()
      );

      await this.relay.publish(event);

    } catch (error) {
      console.error('[NostrSync] Failed to send update:', error);
      this.onError?.(error as Error);
    }
  }

  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.handleLocalUpdate);
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

        const updateData = Buffer.from(message.update, 'base64');

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

          const event = await this.createEvent(
            NostrSyncProvider.HEARTBEAT_KIND,
            JSON.stringify(heartbeat),
            this.getEventTags()
          );

          await this.relay.publish(event);
          this.lastHeartbeat = Date.now();

        } catch (error) {
          console.error('[NostrSync] Heartbeat failed:', error);
        }
      }
    };

    // Send heartbeat every 30 seconds
    setInterval(sendHeartbeat, 30000);
  }

  private async createEvent(kind: number, content: string, tags: string[][]): Promise<Event> {
    // For demo purposes, using a dummy private key
    // In production, this should integrate with the app's signing system
    const privateKey = this.generateDummyPrivateKey();

    const unsignedEvent: UnsignedEvent = {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
      pubkey: this.getClientId(),
    };

    const signedEvent = finalizeEvent(unsignedEvent, privateKey);

    return signedEvent;
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
    // In production, this should return the actual user's pubkey
    // For now, generate a consistent ID based on the Yjs client ID
    return `client_${this.doc.clientID.toString(16)}`;
  }

  private generateDummyPrivateKey(): Uint8Array {
    // Generate a deterministic dummy private key for demo
    // In production, integrate with proper key management
    const seed = this.doc.clientID.toString();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Create a 32-byte Uint8Array
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = (hash >> (i * 8)) & 0xff;
    }
    return keyBytes;
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