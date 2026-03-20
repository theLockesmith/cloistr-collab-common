/**
 * Cloistr storage module - Blossom blob storage with client-side encryption
 *
 * This module provides:
 * - Client-side encryption using XChaCha20-Poly1305
 * - Blossom blob storage with NIP-98 authentication
 * - React hooks for easy integration
 * - Type-safe error handling
 */

// Types
export type {
  BlobMetadata,
  EncryptedBlob,
  StorageConfig,
  StorageSignerInterface,
} from './types.js';

export {
  StorageError,
  EncryptionError,
  BlossomError,
} from './types.js';

// Core functionality
export { BlobStore } from './blossom.js';

export {
  generateKey,
  encryptBlob,
  decryptBlob,
  hexToBytes,
  bytesToHex,
} from './encryption.js';

// React hooks
export {
  useBlobStore,
  useEncryptedUpload,
  useEncryptedDownload,
  useBlobManager,
  useEncryptionKeys,
} from './hooks.js';

export type {
  UploadState,
  DownloadState,
} from './hooks.js';