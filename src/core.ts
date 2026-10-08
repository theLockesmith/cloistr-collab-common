/**
 * @cloistr/collab-common/core — headless entry point.
 *
 * Everything in this module's dependency graph is pure: no React, no y-indexeddb,
 * no browser-only APIs (except where guarded by typeof checks). A Node.js process
 * can import it without React installed.
 *
 * Same pattern as @cloistr/auth/core.
 */

// ── CRDT: document management ───────────────────────────────────────────────
export type {
  DocType,
  CollabDocState,
  SyncProvider,
  NostrSyncConfig,
  DocTypeMap,
  CollabDocConfig,
  CollabDocEvents,
  NostrUpdateMessage,
} from './crdt/types.js';

export {
  createCollabDoc,
  getSharedType,
  serializeDoc,
  deserializeDoc,
  mergeDocuments,
  getStateVector,
  getUpdatesSinceStateVector,
  cloneDocument,
  getDocumentStats,
  validateUpdate,
  initializeDocumentContent,
} from './crdt/document.js';

export type { DocStats } from './crdt/document.js';

export {
  NostrSyncProvider,
  createNostrSyncProvider,
  parsePoWRequirement,
  isAuthRequired,
} from './crdt/provider.js';

export {
  boundedPublish,
  boundedAuth,
  boundedPoolPublish,
  settlePoolPublish,
  AuthSignerError,
  PublishTimeoutError,
  PUBLISH_TIMEOUT_MS,
  AUTH_TIMEOUT_MS,
} from './relay/bounded-publish.js';
export type { PublishablePool, PoolPublishResult } from './relay/bounded-publish.js';

// ── Persistence ─────────────────────────────────────────────────────────────
export type {
  PersistenceConfig,
  SnapshotMetadata,
  SaveResult,
  LoadResult,
  DocumentType,
} from './persistence/types.js';

export {
  PersistenceError,
  SnapshotNotFoundError,
  BlobDownloadError,
} from './persistence/types.js';

export {
  DocumentPersistence,
  createDocumentPersistence,
} from './persistence/DocumentPersistence.js';

// ── Storage: encryption + Blossom ───────────────────────────────────────────
export type {
  BlobMetadata,
  EncryptedBlob,
  StorageConfig,
  StorageSignerInterface,
  SignedEventResult,
} from './storage/types.js';

export {
  StorageError,
  EncryptionError,
  BlossomError,
} from './storage/types.js';

export { BlobStore } from './storage/blossom.js';

export {
  generateKey,
  encryptBlob,
  decryptBlob,
  hexToBytes,
  bytesToHex,
} from './storage/encryption.js';

// ── Relay pool ──────────────────────────────────────────────────────────────
export type {
  RelayStatus,
  RelayState,
  RelayPoolConfig,
  SubscriptionHandle,
  SubscribeOptions,
  PublishOptions,
  PublishResult,
  RelayPoolCallbacks,
  RelayPoolState,
  RelayPoolContextValue,
} from './relay/types.js';

export { RelayPool, createRelayPool } from './relay/pool.js';

export {
  getRelayPrefs,
  invalidateCache,
  createRelayPrefsEvent,
  RELAY_PREFS_KIND,
  RELAY_PREFS_D_TAG,
  NIP65_KIND,
} from './relay/relay-prefs.js';
export type {
  RelayPref,
  RelayPrefs,
  RelayPrefsConfig,
} from './relay/relay-prefs.js';

// ── Sharing ─────────────────────────────────────────────────────────────────
export type {
  PermissionLevel,
  RecipientType,
  ShareEntry,
  ShareMetadata,
  ShareLink,
  ParsedShareLink,
  CreateShareConfig,
  CreateShareResult,
  PermissionCheckResult,
  SharingState,
  SharingContextValue,
} from './sharing/types.js';

export { PERMISSION_HIERARCHY, SharingError } from './sharing/types.js';

export {
  generateShareId,
  hasPermission,
  isShareValid,
  encryptKeyForRecipient,
  decryptKeyFromSender,
  generateShareLink,
  parseShareLink,
  decodeShareLinkKey,
  checkPermission,
  checkLinkPermission,
  createShare,
  incrementViewCount,
  createEmptyShareMetadata,
} from './sharing/utils.js';

// ── Presence awareness ──────────────────────────────────────────────────────
export type {
  UserPresence,
  CursorPosition,
  PresenceState,
  PresenceUpdate,
  PresenceConfig,
  PresenceCallbacks,
} from './presence/types.js';

export {
  createAwareness,
  generateUserColor,
  setLocalState,
  getRemoteStates,
  updateCursor,
  updateSelection,
  initializeLocalUser,
  setupAwarenessListeners,
  destroyAwareness,
} from './presence/awareness.js';

// ── Versioning ──────────────────────────────────────────────────────────────
export type {
  VersionInfo,
  VersionHistory,
  Snapshot,
  UndoState,
  UndoConfig,
  SnapshotConfig,
  SaveSnapshotOptions,
  VersionDiff,
  VersioningContextValue,
} from './versioning/types.js';

export { VersioningError } from './versioning/types.js';

export {
  SnapshotManager,
  generateVersionId,
  hashSnapshot,
  encodeDocState,
  createFullSnapshot,
  applySnapshot,
  snapshotsEqual,
  getDocumentSize,
} from './versioning/snapshot.js';

export {
  EnhancedUndoManager,
  createUndoManager,
  getUndoState,
  performUndo,
  performRedo,
  clearUndoHistory,
  stopTracking,
  resumeTracking,
} from './versioning/undo.js';

// ── Config ──────────────────────────────────────────────────────────────────
export {
  generateDocumentId,
  parseDocumentId,
  isValidDocumentId,
  getOrCreateDocumentId,
  DEFAULT_RELAY_URL,
  DEFAULT_BLOSSOM_URL,
  DEFAULT_DISCOVERY_URL,
  getServiceConfig,
  useServiceConfig,
} from './config/index.js';

export type {
  DocTypePrefix,
  ServiceConfig,
} from './config/index.js';

// ── Headless client ─────────────────────────────────────────────────────────
export { HeadlessCollabClient } from './headless.js';
export type { HeadlessCollabConfig } from './headless.js';

// ── Yjs re-exports ─────────────────────────────────────────────────────────
export type {
  Doc as YDoc,
  Text as YText,
  Map as YMap,
  Array as YArray,
} from 'yjs';
