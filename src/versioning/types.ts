/**
 * @fileoverview Type definitions for versioning module
 * Provides snapshot management, version history, and undo/redo
 */

/**
 * Version/snapshot metadata
 */
export interface VersionInfo {
  /** Unique version ID */
  id: string;
  /** Document ID */
  docId: string;
  /** Version number (sequential) */
  version: number;
  /** Creation timestamp */
  timestamp: number;
  /** Author pubkey */
  authorPubkey: string;
  /** Optional version label/name */
  label?: string;
  /** Optional description of changes */
  description?: string;
  /** Size of the snapshot data in bytes */
  size: number;
  /** Parent version ID (null for initial version) */
  parentId: string | null;
  /** Blossom URL where snapshot is stored */
  blobUrl?: string;
  /** SHA-256 hash of the snapshot data */
  hash?: string;
}

/**
 * Version history for a document
 */
export interface VersionHistory {
  /** Document ID */
  docId: string;
  /** List of versions (most recent first) */
  versions: VersionInfo[];
  /** Current active version ID */
  currentVersionId: string | null;
  /** Total number of versions */
  totalVersions: number;
}

/**
 * Snapshot data structure
 */
export interface Snapshot {
  /** Version info */
  info: VersionInfo;
  /** Yjs document state (encoded) */
  state: Uint8Array;
}

/**
 * Undo manager state
 */
export interface UndoState {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of undo steps available */
  undoStackSize: number;
  /** Number of redo steps available */
  redoStackSize: number;
}

/**
 * Configuration for undo manager
 */
export interface UndoConfig {
  /** Tracked Yjs types (defaults to all shared types) */
  trackedOrigins?: Set<any>;
  /** Capture timeout in ms (groups operations) */
  captureTimeout?: number;
  /** Maximum stack size */
  maxStackSize?: number;
}

/**
 * Configuration for snapshot manager
 */
export interface SnapshotConfig {
  /** Document ID */
  docId: string;
  /** Auto-save interval in ms (0 to disable) */
  autoSaveInterval?: number;
  /** Maximum number of versions to keep */
  maxVersions?: number;
  /** Minimum interval between auto-saves in ms */
  minSaveInterval?: number;
}

/**
 * Snapshot save options
 */
export interface SaveSnapshotOptions {
  /** Optional label for the version */
  label?: string;
  /** Optional description */
  description?: string;
  /** Force save even if no changes */
  force?: boolean;
}

/**
 * Diff between two versions
 */
export interface VersionDiff {
  /** Source version ID */
  fromVersionId: string;
  /** Target version ID */
  toVersionId: string;
  /** Whether there are changes */
  hasChanges: boolean;
  /** Added content (for text documents) */
  additions?: string[];
  /** Removed content (for text documents) */
  deletions?: string[];
  /** Summary of changes */
  summary: string;
}

/**
 * Versioning context value
 */
export interface VersioningContextValue {
  /** Current undo state */
  undoState: UndoState;
  /** Version history */
  history: VersionHistory | null;
  /** Current version info */
  currentVersion: VersionInfo | null;
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean;
  /** Last save timestamp */
  lastSavedAt: number | null;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Undo the last change */
  undo: () => void;
  /** Redo the last undone change */
  redo: () => void;
  /** Save a snapshot */
  saveSnapshot: (options?: SaveSnapshotOptions) => Promise<VersionInfo>;
  /** Restore to a specific version */
  restoreVersion: (versionId: string) => Promise<void>;
  /** Get diff between versions */
  getDiff: (fromVersionId: string, toVersionId: string) => VersionDiff | null;
  /** Enable/disable auto-save */
  setAutoSave: (enabled: boolean) => void;
  /** Clear undo/redo history */
  clearUndoHistory: () => void;
}

/**
 * Error class for versioning operations
 */
export class VersioningError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'VersioningError';
  }
}
