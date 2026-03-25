/**
 * Types for document persistence
 */

import type { SignerInterface } from '../auth/types.js';

/** Document type for collaborative documents */
export type DocumentType = 'doc' | 'sheet' | 'whiteboard' | 'slides';

/**
 * Configuration for document persistence
 */
export interface PersistenceConfig {
  /** Document identifier */
  documentId: string;
  /** Blossom server URL */
  blossomUrl: string;
  /** Relay URL for publishing snapshot events */
  relayUrl: string;
  /** Signer for authentication */
  signer: SignerInterface;
  /** Auto-save interval in milliseconds (0 = disabled) */
  autoSaveInterval?: number;
  /** Encryption key for blob encryption (hex string, optional) */
  encryptionKey?: string;
  /** Document title (user-editable, defaults to documentId) */
  title?: string;
  /** Document type (doc, sheet, whiteboard, slides) */
  documentType?: DocumentType;
  /** Original creation timestamp (preserved across saves) */
  createdAt?: number;
}

/**
 * Snapshot metadata stored in Nostr event
 */
export interface SnapshotMetadata {
  /** Blossom blob hash */
  hash: string;
  /** Blob size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Timestamp when snapshot was created */
  timestamp: number;
  /** Whether the blob is encrypted */
  encrypted: boolean;
  /** Application version that created the snapshot */
  appVersion: string;
  /** Document title (user-editable) */
  title?: string;
  /** Document type (doc, sheet, whiteboard, slides) */
  type?: DocumentType;
  /** Original creation timestamp (preserved across saves) */
  createdAt?: number;
}

/**
 * Result of a save operation
 */
export interface SaveResult {
  /** Blossom blob hash */
  hash: string;
  /** Nostr event ID */
  eventId: string;
  /** Blob size in bytes */
  size: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Result of a load operation
 */
export interface LoadResult {
  /** Whether a snapshot was found */
  found: boolean;
  /** Snapshot metadata (if found) */
  metadata?: SnapshotMetadata;
  /** When the snapshot was last updated */
  lastUpdated?: number;
  /** Nostr event ID */
  eventId?: string;
}

/**
 * Persistence error types
 */
export class PersistenceError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export class SnapshotNotFoundError extends PersistenceError {
  constructor(documentId: string) {
    super(`No snapshot found for document: ${documentId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

export class BlobDownloadError extends PersistenceError {
  constructor(hash: string, cause?: Error) {
    super(`Failed to download blob: ${hash}`, cause);
    this.name = 'BlobDownloadError';
  }
}
