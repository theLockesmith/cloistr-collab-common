/**
 * Cloistr Collaboration Common Library
 *
 * Shared infrastructure for Cloistr collaboration apps
 *
 * Note: Some modules have naming conflicts, so they're imported via subpaths:
 * - import { ... } from '@cloistr/collab-common/versioning'
 * - import { ... } from '@cloistr/collab-common/components'
 */

// Auth module - NIP-46 and NIP-07 authentication
export * from './auth/index.js';

// CRDT module - Yjs document management and Nostr sync
export * from './crdt/index.js';

// Storage module - Blossom client with NIP-44 encryption
export * from './storage/index.js';

// Persistence module - Document snapshots via Blossom
export * from './persistence/index.js';

// Presence module - Real-time user awareness
export * from './presence/index.js';

// Relay module - Multi-relay pool management
export * from './relay/index.js';

// Sharing module - Document sharing and permissions
export * from './sharing/index.js';

// Versioning module - Undo/redo and version history
// Use subpath import: import { ... } from '@cloistr/collab-common/versioning'
export {
  // Types
  type VersionInfo,
  type VersionHistory as VersionHistoryData,
  type Snapshot,
  type UndoState,
  type UndoConfig,
  type SnapshotConfig,
  type SaveSnapshotOptions,
  type VersionDiff,
  type VersioningContextValue,
  VersioningError,
  // Snapshot utilities
  SnapshotManager,
  generateVersionId,
  hashSnapshot,
  encodeDocState,
  createFullSnapshot,
  applySnapshot,
  snapshotsEqual,
  getDocumentSize,
  // Undo utilities
  EnhancedUndoManager,
  createUndoManager,
  getUndoState,
  performUndo,
  performRedo,
  clearUndoHistory,
  stopTracking,
  resumeTracking,
  // Hooks
  useUndo,
  useSnapshots,
  useVersioning,
  useVersioningKeyboard,
} from './versioning/index.js';

// Components module - Shared React UI components
// Use subpath import: import { ... } from '@cloistr/collab-common/components'
export {
  // Types
  type BaseComponentProps,
  type ToolbarProps,
  type ShareDialogProps,
  type VersionHistoryProps,
  type ConnectionStatusProps,
  type SaveStatusProps,
  // Components
  Toolbar,
  ShareDialog,
  ConnectionStatus,
  SaveStatus,
  VersionHistory,
} from './components/index.js';
