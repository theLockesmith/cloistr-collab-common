/**
 * Type definitions for Blossom blob storage with client-side encryption
 */

/**
 * Metadata for a blob stored in Blossom
 */
export interface BlobMetadata {
  /** SHA-256 hash of the blob content */
  hash: string;
  /** Size of the blob in bytes */
  size: number;
  /** MIME type of the blob content */
  mimeType: string;
  /** Timestamp when the blob was created */
  createdAt: number;
  /** Optional URL where the blob can be accessed */
  url?: string;
}

/**
 * Encrypted blob data with encryption metadata
 */
export interface EncryptedBlob {
  /** Base64-encoded encrypted data */
  ciphertext: string;
  /** Base64-encoded nonce/IV */
  nonce: string;
  /** Encryption algorithm used */
  algorithm: 'xchacha20-poly1305';
}

/**
 * Configuration for blob storage
 */
export interface StorageConfig {
  /** Base URL of the Blossom server */
  blossomUrl: string;
  /** Public key for authentication (hex format) - optional if signer provided per-call */
  authPubkey?: string;
}

/**
 * Error types for storage operations
 */
export class StorageError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

export class BlossomError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'BlossomError';
  }
}

/**
 * Signed event with id and signature
 */
export interface SignedEventResult {
  /** Event ID (sha256 hash of serialized event) */
  id: string;
  /** Signature of the event ID */
  sig: string;
}

/**
 * Signer interface for creating authentication signatures
 */
export interface StorageSignerInterface {
  /** Get the public key as hex string */
  getPublicKey(): Promise<string>;
  /** Sign an event and return the signed event with id and sig */
  signEvent(event: any): Promise<SignedEventResult>;
}