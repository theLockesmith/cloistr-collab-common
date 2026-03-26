/**
 * @fileoverview NIP-46 remote signer implementation with circuit breaker and adaptive rate limiting
 * Provides authentication via remote signers using the NIP-46 protocol
 * Ported from cloistr-stash's robust implementation
 */

import {
  Event,
  UnsignedEvent,
  generateSecretKey,
  getPublicKey as getPublicKeyFromPrivateKey,
  finalizeEvent,
  nip04,
} from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import {
  EnhancedSignerInterface,
  Nip46Config,
  Nip46Error,
  Nip46Session,
} from './types.js';
import { RelayHealthManager, DEFAULT_RELAY_CONFIG } from './relay-health.js';
import { SessionManager } from './session.js';

/**
 * NIP-46 request types
 */
type Nip46Method =
  | 'connect'
  | 'sign_event'
  | 'batch_sign'
  | 'get_public_key'
  | 'nip04_encrypt'
  | 'nip04_decrypt'
  | 'disconnect';

/**
 * NIP-46 request structure
 */
interface Nip46Request {
  id: string;
  method: Nip46Method;
  params: any[];
}

/**
 * NIP-46 response structure
 */
interface Nip46Response {
  id: string;
  result?: any;
  error?: string;
}

/**
 * Pending request tracking
 */
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Default relay URLs for NIP-46 communication
 * IMPORTANT: relay.cloistr.xyz MUST be first - it's rate-limit exempt for kind:24133
 */
const DEFAULT_RELAY_URLS = ['wss://relay.cloistr.xyz'];

/**
 * NIP-46 signer implementation with circuit breaker and adaptive rate limiting
 */
class Nip46Signer implements EnhancedSignerInterface {
  private clientSecretKey: Uint8Array;
  private clientPubkey: string;
  private remotePubkey: string;
  private relayUrls: string[];
  private bunkerUrl: string;
  private isConnected = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private seenEvents = new Set<string>();
  private cachedUserPubkey: string | null = null;
  private enableBatchSign: boolean;

  // WebSocket connections (one per relay)
  private sockets: WebSocket[] = [];

  // Health management
  private healthManager: RelayHealthManager;
  private sessionManager: SessionManager;

  constructor(config: Nip46Config) {
    // Use provided client secret key for session persistence, or generate new
    if (config.clientSecretKey) {
      this.clientSecretKey = hexToBytes(config.clientSecretKey);
    } else {
      this.clientSecretKey = generateSecretKey();
    }
    this.clientPubkey = getPublicKeyFromPrivateKey(this.clientSecretKey);
    this.bunkerUrl = config.bunkerUrl;
    this.enableBatchSign = config.enableBatchSign ?? true;

    // Initialize health and session managers
    this.healthManager = new RelayHealthManager(config.relayConfig);
    this.sessionManager = new SessionManager(config.sessionStorageKey);

    // Parse bunker URL to extract remote pubkey and relays
    const { pubkey, relays } = this.parseBunkerUrl(config.bunkerUrl);
    this.remotePubkey = pubkey;

    // Priority: config.relayUrls > bunker URL relays > default relays
    // ALWAYS ensure relay.cloistr.xyz is included (rate-limit exempt for NIP-46)
    const baseRelays = config.relayUrls || (relays.length > 0 ? relays : DEFAULT_RELAY_URLS);
    this.relayUrls = baseRelays.includes('wss://relay.cloistr.xyz')
      ? baseRelays
      : ['wss://relay.cloistr.xyz', ...baseRelays];

    console.log('[NIP-46] Initialized with relays:', this.relayUrls);
  }

  /**
   * Parse bunker URL to extract remote signer's public key and relay URLs
   */
  private parseBunkerUrl(bunkerUrl: string): { pubkey: string; relays: string[] } {
    try {
      // Handle both bunker:// and nostrconnect:// formats
      const normalizedUrl = bunkerUrl.replace('nostrconnect://', 'bunker://');

      const url = new URL(normalizedUrl);
      if (url.protocol !== 'bunker:') {
        throw new Error('Invalid bunker URL protocol');
      }

      const relays = url.searchParams.getAll('relay');

      return {
        pubkey: url.hostname,
        relays,
      };
    } catch (error) {
      throw new Nip46Error(
        `Invalid bunker URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INVALID_BUNKER_URL'
      );
    }
  }

  /**
   * Connect to a single relay via WebSocket with circuit breaker
   */
  private async connectSingleRelay(url: string): Promise<WebSocket | null> {
    // Check circuit breaker before attempting connection
    if (!this.healthManager.isHealthy(url)) {
      console.log(`[NIP-46] Skipping unhealthy relay: ${url}`);
      return null;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.healthManager.recordFailure(url, 'connection timeout');
        resolve(null);
      }, DEFAULT_RELAY_CONFIG.CONNECT_TIMEOUT_MS);

      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log(`[NIP-46] Connected to ${url}`);
          this.healthManager.recordSuccess(url);
          resolve(ws);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          this.healthManager.recordFailure(url, 'connection error');
          resolve(null);
        };

        ws.onclose = () => {
          // Remove from active sockets
          this.sockets = this.sockets.filter(s => s !== ws);
        };

        ws.onmessage = (msg) => this.handleRelayMessage(msg, url);
      } catch (err) {
        clearTimeout(timeout);
        this.healthManager.recordFailure(url, 'connection exception');
        resolve(null);
      }
    });
  }

  /**
   * Handle incoming relay messages
   */
  private async handleRelayMessage(msg: MessageEvent, relayUrl: string): Promise<void> {
    try {
      const message = JSON.parse(msg.data);

      if (message[0] === 'EVENT') {
        const event: Event = message[2];

        // Deduplicate events from multiple relays
        if (this.seenEvents.has(event.id)) {
          return;
        }
        this.seenEvents.add(event.id);

        // Handle NIP-46 response events
        if (event.kind === 24133) {
          this.healthManager.recordSuccess(relayUrl);
          await this.handleResponse(event);
        }
      } else if (message[0] === 'OK') {
        // Event published successfully
        this.healthManager.recordSuccess(relayUrl);
      } else if (message[0] === 'NOTICE') {
        const notice = message[1] as string;
        console.warn(`[NIP-46] Notice from ${relayUrl}:`, notice);

        // Detect rate limiting
        if (notice.toLowerCase().includes('rate') || notice.toLowerCase().includes('limit')) {
          this.healthManager.recordRateLimit(relayUrl);
        }
      }
    } catch (err) {
      console.error('[NIP-46] Failed to parse relay message:', err);
    }
  }

  /**
   * Connect to the remote signer
   */
  async connect(): Promise<void> {
    try {
      // Connect to all healthy relays in parallel
      const connections = await Promise.all(
        this.relayUrls.map(url => this.connectSingleRelay(url))
      );

      this.sockets = connections.filter((ws): ws is WebSocket => ws !== null);

      if (this.sockets.length === 0) {
        // All relays unhealthy - reset circuit breakers and retry once
        console.warn('[NIP-46] All relays unhealthy, resetting circuit breakers');
        this.healthManager.resetAll();

        const retryConnections = await Promise.all(
          this.relayUrls.map(url => this.connectSingleRelay(url))
        );
        this.sockets = retryConnections.filter((ws): ws is WebSocket => ws !== null);

        if (this.sockets.length === 0) {
          throw new Error('Failed to connect to any relay');
        }
      }

      // Subscribe to responses on all connected relays
      const filter = {
        kinds: [24133],
        '#p': [this.clientPubkey],
        authors: [this.remotePubkey],
      };

      for (const ws of this.sockets) {
        const subId = crypto.randomUUID().slice(0, 8);
        ws.send(JSON.stringify(['REQ', subId, filter]));
      }

      // Send connect request
      await this.sendRequest('connect', [this.clientPubkey, '']);

      this.isConnected = true;
      console.log('[NIP-46] Connected successfully');
    } catch (error) {
      throw new Nip46Error(
        `Failed to connect to remote signer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED'
      );
    }
  }

  /**
   * Send a request to the remote signer with health-aware relay selection
   */
  private async sendRequest(method: Nip46Method, params: any[]): Promise<any> {
    const requestId = crypto.randomUUID();
    const request: Nip46Request = {
      id: requestId,
      method,
      params,
    };

    // Encrypt the request
    const encryptedContent = await nip04.encrypt(
      this.clientSecretKey,
      this.remotePubkey,
      JSON.stringify(request)
    );

    // Create the event
    const event = finalizeEvent(
      {
        kind: 24133,
        tags: [['p', this.remotePubkey]],
        content: encryptedContent,
        created_at: Math.floor(Date.now() / 1000),
      },
      this.clientSecretKey
    );

    // Get healthy sockets sorted by throttle
    const healthySockets = this.getHealthySockets();

    if (healthySockets.length === 0) {
      // No healthy sockets - reset circuit breakers for open connections
      if (this.sockets.length > 0) {
        console.warn('[NIP-46] No healthy sockets, resetting circuit breakers');
        this.healthManager.resetAll();
      } else {
        throw new Nip46Error('No relay connections available', 'NO_RELAYS');
      }
    }

    // Send to all healthy relays with throttling
    const message = JSON.stringify(['EVENT', event]);
    for (const ws of healthySockets) {
      try {
        await this.healthManager.waitForThrottle(ws.url);
        ws.send(message);
      } catch (err) {
        console.warn(`[NIP-46] Failed to send to ${ws.url}:`, err);
      }
    }

    // Wait for response with dynamic timeout
    const timeout = this.healthManager.getDynamicTimeout();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Nip46Error(
          `Request timed out after ${timeout}ms (relays: ${this.relayUrls.join(', ')})`,
          'TIMEOUT'
        ));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });
    });
  }

  /**
   * Get healthy sockets sorted by throttle (prefer faster relays)
   */
  private getHealthySockets(): WebSocket[] {
    return this.sockets
      .filter(ws => ws.readyState === WebSocket.OPEN && this.healthManager.isHealthy(ws.url))
      .sort((a, b) => {
        const healthA = this.healthManager.getRelayHealth(a.url);
        const healthB = this.healthManager.getRelayHealth(b.url);
        return healthA.throttleMs - healthB.throttleMs;
      });
  }

  /**
   * Handle response from remote signer
   */
  private async handleResponse(event: Event): Promise<void> {
    try {
      const decryptedContent = await nip04.decrypt(
        this.clientSecretKey,
        event.pubkey,
        event.content
      );

      const response: Nip46Response = JSON.parse(decryptedContent);
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Nip46Error(response.error, 'REMOTE_ERROR'));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      console.error('[NIP-46] Failed to handle response:', error);
    }
  }

  /**
   * Get the public key from the remote signer
   */
  async getPublicKey(): Promise<string> {
    if (this.cachedUserPubkey) {
      return this.cachedUserPubkey;
    }

    if (!this.isConnected) {
      await this.connect();
    }

    try {
      this.cachedUserPubkey = await this.sendRequest('get_public_key', []);
      return this.cachedUserPubkey!;
    } catch (error) {
      throw new Nip46Error(
        `Failed to get public key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_PUBKEY_FAILED'
      );
    }
  }

  /**
   * Sign an event using the remote signer
   */
  async signEvent(event: UnsignedEvent): Promise<Event> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.sendRequest('sign_event', [JSON.stringify(event)]);
      return typeof result === 'string' ? JSON.parse(result) : result;
    } catch (error) {
      throw new Nip46Error(
        `Failed to sign event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SIGN_EVENT_FAILED'
      );
    }
  }

  /**
   * Sign multiple events in a batch (cloistr-signer extension)
   * Falls back to individual signing if batch_sign not supported
   */
  async batchSignEvents(events: UnsignedEvent[]): Promise<Event[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    if (!events || events.length === 0) {
      return [];
    }

    // Add pubkey if not present
    const userPubkey = await this.getPublicKey();
    const eventsWithPubkey = events.map(event => ({
      ...event,
      pubkey: event.pubkey || userPubkey,
    }));

    console.log(`[NIP-46] batchSignEvents called for ${events.length} events`);

    if (!this.enableBatchSign) {
      // Batch signing disabled, use individual signs
      const signedEvents: Event[] = [];
      for (const event of eventsWithPubkey) {
        signedEvents.push(await this.signEvent(event));
      }
      return signedEvents;
    }

    // Try batch_sign first (cloistr extension)
    try {
      const params = eventsWithPubkey.map(e => JSON.stringify(e));
      const result = await this.sendRequest('batch_sign', params);

      // Parse the result (array of signed events)
      let signedEvents: any[];
      if (typeof result === 'string') {
        signedEvents = JSON.parse(result);
      } else {
        signedEvents = result;
      }

      // Parse each signed event if needed
      return signedEvents.map((se) => {
        if (typeof se === 'string') {
          return JSON.parse(se);
        }
        return se;
      });
    } catch (err) {
      // If batch_sign not supported, fall back to individual signEvent calls
      if (err instanceof Error && err.message.includes('unknown method')) {
        console.log('[NIP-46] batch_sign not supported, falling back to individual signs');
        const signedEvents: Event[] = [];
        for (const event of eventsWithPubkey) {
          signedEvents.push(await this.signEvent(event));
        }
        return signedEvents;
      }
      throw err;
    }
  }

  /**
   * Encrypt a message using NIP-04
   */
  async encrypt(pubkey: string, plaintext: string): Promise<string> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      return await this.sendRequest('nip04_encrypt', [pubkey, plaintext]);
    } catch (error) {
      throw new Nip46Error(
        `Failed to encrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ENCRYPT_FAILED'
      );
    }
  }

  /**
   * Decrypt a message using NIP-04
   */
  async decrypt(pubkey: string, ciphertext: string): Promise<string> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      return await this.sendRequest('nip04_decrypt', [pubkey, ciphertext]);
    } catch (error) {
      throw new Nip46Error(
        `Failed to decrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DECRYPT_FAILED'
      );
    }
  }

  /**
   * Get the client secret key as hex for session persistence
   */
  getClientSecretKey(): string {
    return bytesToHex(this.clientSecretKey);
  }

  /**
   * Get relay URLs used for NIP-46 communication
   */
  getRelayUrls(): string[] {
    return [...this.relayUrls];
  }

  /**
   * Check if a saved session exists
   */
  hasSavedSession(): boolean {
    return this.sessionManager.hasSavedSession();
  }

  /**
   * Save current session for later restoration
   */
  saveSession(): void {
    if (!this.isConnected || !this.cachedUserPubkey) {
      console.warn('[NIP-46] Cannot save session - not connected');
      return;
    }

    const session: Nip46Session = {
      userPubkey: this.cachedUserPubkey,
      remotePubkey: this.remotePubkey,
      relayUrls: this.relayUrls,
      clientSecretKey: this.getClientSecretKey(),
      bunkerUrl: this.bunkerUrl,
      timestamp: Date.now(),
    };

    this.sessionManager.saveSession(session);
  }

  /**
   * Restore a previously saved session
   * @returns User pubkey if restored successfully, null otherwise
   */
  async restoreSession(): Promise<string | null> {
    const session = this.sessionManager.loadSession();
    if (!session) {
      return null;
    }

    console.log('[NIP-46] Restoring session...');

    try {
      // Restore client keypair
      this.clientSecretKey = hexToBytes(session.clientSecretKey);
      this.clientPubkey = getPublicKeyFromPrivateKey(this.clientSecretKey);
      this.remotePubkey = session.remotePubkey;
      this.relayUrls = session.relayUrls;
      this.bunkerUrl = session.bunkerUrl;

      // Reconnect
      await this.connect();

      // Verify we can still get the public key
      const pubkey = await this.getPublicKey();

      if (pubkey !== session.userPubkey) {
        console.warn('[NIP-46] Session restored but pubkey mismatch');
        this.sessionManager.clearSession();
        return null;
      }

      this.cachedUserPubkey = pubkey;
      console.log('[NIP-46] Session restored successfully');
      return pubkey;
    } catch (err) {
      console.error('[NIP-46] Failed to restore session:', err);
      this.sessionManager.clearSession();
      return null;
    }
  }

  /**
   * Disconnect from the remote signer
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.sendRequest('disconnect', []);
    } catch (error) {
      console.warn('[NIP-46] Failed to send disconnect request:', error);
    } finally {
      this.isConnected = false;
      this.cachedUserPubkey = null;

      // Close all WebSocket connections
      for (const ws of this.sockets) {
        try {
          ws.close();
        } catch {
          // Ignore close errors
        }
      }
      this.sockets = [];

      // Clear pending requests
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Nip46Error('Connection closed', 'DISCONNECTED'));
      }
      this.pendingRequests.clear();
      this.seenEvents.clear();

      // Reset health state for fresh start on reconnect
      this.healthManager.resetAll();
    }
  }
}

/**
 * Connect to a NIP-46 remote signer
 * @param config - NIP-46 configuration including bunker URL
 * @returns Promise resolving to enhanced signer interface
 * @throws Nip46Error if connection fails
 */
export async function connectNip46(config: Nip46Config): Promise<EnhancedSignerInterface> {
  const signer = new Nip46Signer(config);
  await signer.connect();
  return signer;
}

/**
 * Restore a NIP-46 session from storage
 * @param config - Partial config (session data loaded from storage)
 * @returns Promise resolving to signer and user pubkey, or null if no session
 */
export async function restoreNip46Session(
  storageKey?: string
): Promise<{ signer: EnhancedSignerInterface; pubkey: string } | null> {
  const sessionManager = new SessionManager(storageKey);
  const session = sessionManager.loadSession();

  if (!session) {
    return null;
  }

  try {
    const signer = new Nip46Signer({
      bunkerUrl: session.bunkerUrl,
      relayUrls: session.relayUrls,
      clientSecretKey: session.clientSecretKey,
      sessionStorageKey: storageKey,
    });

    const pubkey = await signer.restoreSession();
    if (!pubkey) {
      return null;
    }

    return { signer, pubkey };
  } catch {
    sessionManager.clearSession();
    return null;
  }
}

/**
 * Check if a NIP-46 session exists in storage
 */
export function hasNip46Session(storageKey?: string): boolean {
  const sessionManager = new SessionManager(storageKey);
  return sessionManager.hasSavedSession();
}

/**
 * Clear a NIP-46 session from storage
 */
export function clearNip46Session(storageKey?: string): void {
  const sessionManager = new SessionManager(storageKey);
  sessionManager.clearSession();
}

/**
 * Check if NIP-46 is supported in the current environment
 */
export function isNip46Supported(): boolean {
  return typeof crypto !== 'undefined' && typeof WebSocket !== 'undefined';
}

/**
 * Validate a bunker URL format
 * @param bunkerUrl - URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidBunkerUrl(bunkerUrl: string): boolean {
  try {
    const normalizedUrl = bunkerUrl.replace('nostrconnect://', 'bunker://');
    const url = new URL(normalizedUrl);
    return url.protocol === 'bunker:' && url.hostname.length === 64;
  } catch {
    return false;
  }
}

// Re-export for convenience
export { RelayHealthManager, DEFAULT_RELAY_CONFIG } from './relay-health.js';
export { SessionManager } from './session.js';
