/**
 * @fileoverview Versioning module - Document versioning, undo/redo, and snapshots
 * Provides version history, undo/redo functionality, and snapshot management
 */

// Export types
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
} from './types.js';

export { VersioningError } from './types.js';

// Export snapshot utilities
export {
  SnapshotManager,
  generateVersionId,
  hashSnapshot,
  encodeDocState,
  createFullSnapshot,
  applySnapshot,
  snapshotsEqual,
  getDocumentSize,
} from './snapshot.js';

// Export undo utilities
export {
  EnhancedUndoManager,
  createUndoManager,
  getUndoState,
  performUndo,
  performRedo,
  clearUndoHistory,
  stopTracking,
  resumeTracking,
} from './undo.js';

// Export hooks
export {
  useUndo,
  useSnapshots,
  useVersioning,
  useVersioningKeyboard,
} from './hooks.js';
