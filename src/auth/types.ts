/**
 * @fileoverview Type definitions for Cloistr auth module
 * Provides unified NIP-46 (remote signer) and NIP-07 (browser extension) authentication
 */

import { Event, UnsignedEvent } from 'nostr-tools';

/**
 * Authentication methods supported by Cloistr
 */
export type AuthMethod = 'nip07' | 'nip46';

/**
 * Current authentication state
 */
export interface AuthState {
  /** User's public key (hex format) */
  pubkey: string | null;
  /** Whether user is currently connected */
  isConnected: boolean;
  /** Authentication method being used */
  method: AuthMethod | null;
  /** Whether connection is in progress */
  isConnecting: boolean;
  /** Connection error if any */
  error: string | null;
}

/**
 * Unified signer interface for both NIP-07 and NIP-46
 * Provides cryptographic operations for Nostr events
 */
export interface SignerInterface {
  /**
   * Get the public key of the signer
   * @returns Promise resolving to public key in hex format
   */
  getPublicKey(): Promise<string>;

  /**
   * Sign a Nostr event
   * @param event - Unsigned event to sign
   * @returns Promise resolving to signed event
   */
  signEvent(event: UnsignedEvent): Promise<Event>;

  /**
   * Encrypt a message using NIP-04 encryption
   * @param pubkey - Recipient's public key (hex)
   * @param plaintext - Message to encrypt
   * @returns Promise resolving to encrypted message
   */
  encrypt(pubkey: string, plaintext: string): Promise<string>;

  /**
   * Decrypt a message using NIP-04 decryption
   * @param pubkey - Sender's public key (hex)
   * @param ciphertext - Encrypted message to decrypt
   * @returns Promise resolving to decrypted plaintext
   */
  decrypt(pubkey: string, ciphertext: string): Promise<string>;

  /**
   * Disconnect the signer (cleanup)
   */
  disconnect?(): Promise<void>;
}

/**
 * Configuration for NIP-46 connection
 */
export interface Nip46Config {
  /** Bunker URL for remote signer */
  bunkerUrl: string;
  /** Optional relay URLs to use for communication */
  relayUrls?: string[];
  /** Timeout for connection attempts (ms) */
  timeout?: number;
}

/**
 * Auth context value provided by AuthProvider
 */
export interface AuthContextValue {
  /** Current authentication state */
  authState: AuthState;
  /** Connect using NIP-07 browser extension */
  connectNip07(): Promise<void>;
  /** Connect using NIP-46 remote signer */
  connectNip46(config: Nip46Config): Promise<void>;
  /** Disconnect current signer */
  disconnect(): Promise<void>;
  /** Current signer interface (null if not connected) */
  signer: SignerInterface | null;
}

/**
 * Error types for auth operations
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly method: AuthMethod,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * NIP-07 specific errors
 */
export class Nip07Error extends AuthError {
  constructor(message: string, code?: string) {
    super(message, 'nip07', code);
    this.name = 'Nip07Error';
  }
}

/**
 * NIP-46 specific errors
 */
export class Nip46Error extends AuthError {
  constructor(message: string, code?: string) {
    super(message, 'nip46', code);
    this.name = 'Nip46Error';
  }
}

/**
 * Browser extension detection result
 */
export interface ExtensionDetection {
  /** Whether a NIP-07 extension is available */
  available: boolean;
  /** Extension name if detected */
  name?: string;
  /** Extension version if available */
  version?: string;
}