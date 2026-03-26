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

  /**
   * Get the client secret key for session persistence (NIP-46 only)
   * @returns Client secret key in hex format, or undefined for NIP-07
   */
  getClientSecretKey?(): string;
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
  /** Optional client secret key (hex) for session persistence */
  clientSecretKey?: string;
  /** Optional circuit breaker/rate limiting configuration */
  relayConfig?: Partial<RelayConfig>;
  /** Enable batch_sign extension (default: true) */
  enableBatchSign?: boolean;
  /** Session storage key (default: 'cloistr_nip46_session') */
  sessionStorageKey?: string;
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

// ============================================================
// Relay Health & Circuit Breaker Types
// ============================================================

/**
 * Per-relay health tracking for circuit breaker pattern
 */
export interface RelayHealth {
  /** Consecutive failure count */
  failures: number;
  /** Timestamp of last failure */
  lastFailure: number;
  /** Whether circuit breaker has disabled this relay */
  disabled: boolean;
  /** Current throttle delay in ms */
  throttleMs: number;
  /** Timestamp of last request sent */
  lastRequest: number;
  /** Whether relay is currently rate-limited */
  rateLimited: boolean;
  /** Reason for last failure */
  lastReason?: string;
}

/**
 * Circuit breaker and rate limiting configuration
 */
export interface RelayConfig {
  /** Circuit opens after N consecutive failures (default: 5) */
  MAX_FAILURES: number;
  /** Cooldown before retry after circuit opens (default: 60000ms) */
  COOLDOWN_MS: number;
  /** Minimum throttle delay (default: 0ms) */
  MIN_THROTTLE_MS: number;
  /** Maximum throttle delay (default: 2000ms) */
  MAX_THROTTLE_MS: number;
  /** Throttle increase per rate-limit hit (default: 250ms) */
  THROTTLE_INCREASE: number;
  /** Throttle decrease per success (default: 100ms) */
  THROTTLE_DECREASE: number;
  /** Per-relay connection timeout (default: 10000ms) */
  CONNECT_TIMEOUT_MS: number;
  /** Base timeout for NIP-46 requests (default: 30000ms) */
  BASE_TIMEOUT_MS: number;
  /** Multiplier for throttle in timeout calculation (default: 3) */
  THROTTLE_TIMEOUT_BUFFER: number;
}

// ============================================================
// Session Persistence Types
// ============================================================

/**
 * Persisted NIP-46 session data
 */
export interface Nip46Session {
  /** User's public key (hex) */
  userPubkey: string;
  /** Remote signer's public key (hex) */
  remotePubkey: string;
  /** Relay URLs used for communication */
  relayUrls: string[];
  /** Client secret key (hex) for session continuity */
  clientSecretKey: string;
  /** Bunker URL for reconnection */
  bunkerUrl: string;
  /** Session creation timestamp */
  timestamp: number;
}

/**
 * Session persistence interface
 */
export interface SessionPersistence {
  /** Check if a saved session exists */
  hasSavedSession(): boolean;
  /** Save current session */
  saveSession(session: Nip46Session): void;
  /** Load saved session */
  loadSession(): Nip46Session | null;
  /** Clear saved session */
  clearSession(): void;
}

// ============================================================
// Enhanced Signer Interface
// ============================================================

/**
 * Extended signer interface with batch signing and session persistence
 */
export interface EnhancedSignerInterface extends SignerInterface {
  /**
   * Sign multiple events in a batch (cloistr-signer extension)
   * Falls back to individual signing if not supported
   * @param events - Array of unsigned events
   * @returns Promise resolving to array of signed events
   */
  batchSignEvents?(events: UnsignedEvent[]): Promise<Event[]>;

  /**
   * Check if a saved session exists
   */
  hasSavedSession?(): boolean;

  /**
   * Restore a previously saved session
   * @returns Promise resolving to user pubkey if restored, null otherwise
   */
  restoreSession?(): Promise<string | null>;

  /**
   * Get relay URLs used for NIP-46 communication
   */
  getRelayUrls?(): string[];
}