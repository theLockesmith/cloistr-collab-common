/**
 * Cloistr persistence module - Document snapshots via Blossom storage
 *
 * This module provides:
 * - Document state serialization via Yjs
 * - Blob storage via Blossom with NIP-98 authentication
 * - Snapshot tracking via kind 30078 Nostr events
 * - Auto-save functionality
 */

// Types
export type {
  PersistenceConfig,
  SnapshotMetadata,
  SaveResult,
  LoadResult,
} from './types.js';

export {
  PersistenceError,
  SnapshotNotFoundError,
  BlobDownloadError,
} from './types.js';

// Core functionality
export {
  DocumentPersistence,
  createDocumentPersistence,
} from './DocumentPersistence.js';

// React hooks
export {
  useDocumentPersistence,
  usePersistenceUI,
} from './hooks.js';

export type {
  PersistenceState,
  PersistenceControls,
} from './hooks.js';
