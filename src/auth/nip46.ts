/**
 * @fileoverview NIP-46 remote signer implementation
 * Provides authentication via remote signers using the NIP-46 protocol
 */

import {
  Event,
  UnsignedEvent,
  generateSecretKey,
  getPublicKey as getPublicKeyFromPrivateKey,
  finalizeEvent,
  SimplePool,
  nip04,
} from 'nostr-tools';
import { SignerInterface, Nip46Config, Nip46Error } from './types.js';

/**
 * NIP-46 request types
 */
type Nip46Method =
  | 'connect'
  | 'sign_event'
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
 * Default relay URLs for NIP-46 communication
 */
const DEFAULT_RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.nostr.band',
];

/**
 * NIP-46 signer implementation using remote signer protocol
 */
class Nip46Signer implements SignerInterface {
  private clientSecretKey: Uint8Array;
  private clientPubkey: string;
  private remotePubkey: string;
  private pool: SimplePool;
  private relayUrls: string[];
  private isConnected = false;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private timeout: number;
  private cachedRemotePubkey: string | null = null;

  constructor(config: Nip46Config) {
    this.clientSecretKey = generateSecretKey();
    this.clientPubkey = getPublicKeyFromPrivateKey(this.clientSecretKey);
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.relayUrls = config.relayUrls || DEFAULT_RELAY_URLS;
    this.pool = new SimplePool();

    // Parse bunker URL to extract remote pubkey
    this.remotePubkey = this.parseBunkerUrl(config.bunkerUrl);
  }

  /**
   * Parse bunker URL to extract remote signer's public key
   */
  private parseBunkerUrl(bunkerUrl: string): string {
    // Format: bunker://<pubkey>?relay=<relay_url>&relay=<relay_url>
    try {
      const url = new URL(bunkerUrl);
      if (url.protocol !== 'bunker:') {
        throw new Error('Invalid bunker URL protocol');
      }
      return url.hostname;
    } catch (error) {
      throw new Nip46Error(
        `Invalid bunker URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INVALID_BUNKER_URL'
      );
    }
  }

  /**
   * Connect to the remote signer
   */
  async connect(): Promise<void> {
    try {
      // Connect to relays
      await Promise.all(
        this.relayUrls.map(url => this.pool.ensureRelay(url))
      );

      // Subscribe to responses from the remote signer
      const filter = {
        kinds: [24133], // NIP-46 response events
        '#p': [this.clientPubkey],
        authors: [this.remotePubkey],
      };

      this.pool.subscribeMany(
        this.relayUrls,
        [filter] as any, // TODO: Fix nostr-tools Filter type for tag filters
        {
          onevent: (event: Event) => this.handleResponse(event),
        }
      );

      // Send connect request
      await this.sendRequest('connect', [this.clientPubkey, '']);

      this.isConnected = true;
    } catch (error) {
      throw new Nip46Error(
        `Failed to connect to remote signer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED'
      );
    }
  }

  /**
   * Send a request to the remote signer
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

    // Create and publish the event
    const event = finalizeEvent(
      {
        kind: 24133, // NIP-46 request event
        tags: [['p', this.remotePubkey]],
        content: encryptedContent,
        created_at: Math.floor(Date.now() / 1000),
      },
      this.clientSecretKey
    );

    await this.pool.publish(this.relayUrls, event);

    // Wait for response
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Nip46Error('Request timed out', 'TIMEOUT'));
      }, this.timeout);
    });
  }

  /**
   * Handle response from remote signer
   */
  private async handleResponse(event: Event): Promise<void> {
    try {
      // Decrypt the response
      const decryptedContent = await nip04.decrypt(
        this.clientSecretKey,
        event.pubkey,
        event.content
      );

      const response: Nip46Response = JSON.parse(decryptedContent);
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Nip46Error(response.error, 'REMOTE_ERROR'));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      console.error('Failed to handle NIP-46 response:', error);
    }
  }

  /**
   * Get the public key from the remote signer
   */
  async getPublicKey(): Promise<string> {
    if (this.cachedRemotePubkey) {
      return this.cachedRemotePubkey;
    }

    if (!this.isConnected) {
      await this.connect();
    }

    try {
      this.cachedRemotePubkey = await this.sendRequest('get_public_key', []);
      return this.cachedRemotePubkey!;
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
      return await this.sendRequest('sign_event', [event]);
    } catch (error) {
      throw new Nip46Error(
        `Failed to sign event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SIGN_EVENT_FAILED'
      );
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
   * Disconnect from the remote signer
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      // Send disconnect request
      await this.sendRequest('disconnect', []);
    } catch (error) {
      // Ignore disconnect errors
      console.warn('Failed to send disconnect request:', error);
    } finally {
      this.isConnected = false;
      this.cachedRemotePubkey = null;
      this.pool.close(this.relayUrls);

      // Clear pending requests
      this.pendingRequests.forEach(pending => {
        pending.reject(new Nip46Error('Connection closed', 'DISCONNECTED'));
      });
      this.pendingRequests.clear();
    }
  }
}

/**
 * Connect to a NIP-46 remote signer
 * @param config - NIP-46 configuration including bunker URL
 * @returns Promise resolving to signer interface
 * @throws Nip46Error if connection fails
 */
export async function connectNip46(config: Nip46Config): Promise<SignerInterface> {
  const signer = new Nip46Signer(config);
  await signer.connect();
  return signer;
}

/**
 * Check if NIP-46 is supported in the current environment
 */
export function isNip46Supported(): boolean {
  // NIP-46 works in any environment that supports WebSockets and crypto
  return typeof crypto !== 'undefined' && typeof WebSocket !== 'undefined';
}

/**
 * Validate a bunker URL format
 * @param bunkerUrl - URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidBunkerUrl(bunkerUrl: string): boolean {
  try {
    const url = new URL(bunkerUrl);
    return url.protocol === 'bunker:' && url.hostname.length === 64; // pubkey should be 64 hex chars
  } catch {
    return false;
  }
}