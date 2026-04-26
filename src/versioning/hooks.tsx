/**
 * @fileoverview React hooks for document versioning
 * Provides undo/redo, snapshots, and version history management
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Y from 'yjs';
import {
  UndoState,
  UndoConfig,
  VersionInfo,
  VersionHistory,
  Snapshot,
  SnapshotConfig,
  SaveSnapshotOptions,
} from './types.js';
import { EnhancedUndoManager } from './undo.js';
import { SnapshotManager } from './snapshot.js';

/**
 * Hook for undo/redo functionality
 */
export function useUndo(
  doc: Y.Doc | null,
  scope: Y.AbstractType<any> | Y.AbstractType<any>[] | null,
  config?: UndoConfig
): {
  state: UndoState;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const [state, setState] = useState<UndoState>({
    canUndo: false,
    canRedo: false,
    undoStackSize: 0,
    redoStackSize: 0,
  });

  const undoManagerRef = useRef<EnhancedUndoManager | null>(null);

  useEffect(() => {
    if (!doc || !scope) {
      setState({
        canUndo: false,
        canRedo: false,
        undoStackSize: 0,
        redoStackSize: 0,
      });
      return;
    }

    const manager = new EnhancedUndoManager(doc, scope, config);
    undoManagerRef.current = manager;

    // Subscribe to state changes
    const unsubscribe = manager.onStateChange(setState);

    // Set initial state
    setState(manager.getState());

    return () => {
      unsubscribe();
      manager.destroy();
      undoManagerRef.current = null;
    };
  }, [doc, scope]);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  const clear = useCallback(() => {
    undoManagerRef.current?.clear();
  }, []);

  return {
    state,
    undo,
    redo,
    clear,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  };
}

/**
 * Hook for snapshot/version management
 */
export function useSnapshots(
  doc: Y.Doc | null,
  config: SnapshotConfig,
  userPubkey: string | null,
  options?: {
    /** Callback when snapshot is saved */
    onSave?: (snapshot: Snapshot) => Promise<void>;
    /** Callback when version is restored */
    onRestore?: (versionId: string) => void;
    /** Initial history (from persistence) */
    initialHistory?: VersionHistory;
    /** Load snapshot data by version ID */
    loadSnapshot?: (versionId: string) => Promise<Snapshot | null>;
  }
): {
  history: VersionHistory | null;
  currentVersion: VersionInfo | null;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  autoSaveEnabled: boolean;
  isSaving: boolean;
  saveSnapshot: (saveOptions?: SaveSnapshotOptions) => Promise<VersionInfo | null>;
  restoreVersion: (versionId: string) => Promise<boolean>;
  setAutoSave: (enabled: boolean) => void;
} {
  const [history, setHistory] = useState<VersionHistory | null>(
    options?.initialHistory || null
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(config.autoSaveInterval ? config.autoSaveInterval > 0 : false);
  const [isSaving, setIsSaving] = useState(false);

  const managerRef = useRef<SnapshotManager | null>(null);

  // Initialize snapshot manager
  useEffect(() => {
    const manager = new SnapshotManager(config);
    managerRef.current = manager;

    if (options?.initialHistory) {
      manager.loadHistory(options.initialHistory);
    }

    manager.onHistoryChange = (newHistory) => {
      setHistory(newHistory);
    };

    manager.onSnapshot = (snapshot) => {
      setLastSavedAt(snapshot.info.timestamp);
      setHasUnsavedChanges(false);
    };

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [config.docId]);

  // Track document changes
  useEffect(() => {
    if (!doc) return;

    const handleUpdate = () => {
      setHasUnsavedChanges(true);
      managerRef.current?.markChanged();
    };

    doc.on('update', handleUpdate);

    return () => {
      doc.off('update', handleUpdate);
    };
  }, [doc]);

  // Handle auto-save
  useEffect(() => {
    if (!doc || !userPubkey || !managerRef.current) return;

    if (autoSaveEnabled) {
      managerRef.current.startAutoSave(doc, userPubkey);
    } else {
      managerRef.current.stopAutoSave();
    }

    return () => {
      managerRef.current?.stopAutoSave();
    };
  }, [doc, userPubkey, autoSaveEnabled]);

  // Save snapshot
  const saveSnapshot = useCallback(async (
    saveOptions?: SaveSnapshotOptions
  ): Promise<VersionInfo | null> => {
    if (!doc || !userPubkey || !managerRef.current) {
      return null;
    }

    setIsSaving(true);
    try {
      const snapshot = managerRef.current.createSnapshot(doc, userPubkey, saveOptions);

      // Call external save callback if provided
      if (options?.onSave) {
        await options.onSave(snapshot);
      }

      return snapshot.info;
    } catch (error) {
      console.error('[useSnapshots] Save failed:', error);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [doc, userPubkey, options?.onSave]);

  // Restore version
  const restoreVersion = useCallback(async (versionId: string): Promise<boolean> => {
    if (!doc || !managerRef.current || !options?.loadSnapshot) {
      return false;
    }

    try {
      const snapshot = await options.loadSnapshot(versionId);
      if (!snapshot) {
        console.error('[useSnapshots] Snapshot not found:', versionId);
        return false;
      }

      managerRef.current.restoreFromSnapshot(doc, snapshot);
      options?.onRestore?.(versionId);
      return true;
    } catch (error) {
      console.error('[useSnapshots] Restore failed:', error);
      return false;
    }
  }, [doc, options?.loadSnapshot, options?.onRestore]);

  // Toggle auto-save
  const setAutoSave = useCallback((enabled: boolean) => {
    setAutoSaveEnabled(enabled);
  }, []);

  // Get current version
  const currentVersion = useMemo(() => {
    return managerRef.current?.getCurrentVersion() || null;
  }, [history]);

  return {
    history,
    currentVersion,
    hasUnsavedChanges,
    lastSavedAt,
    autoSaveEnabled,
    isSaving,
    saveSnapshot,
    restoreVersion,
    setAutoSave,
  };
}

/**
 * Hook for combined versioning functionality (undo + snapshots)
 */
export function useVersioning(
  doc: Y.Doc | null,
  scope: Y.AbstractType<any> | Y.AbstractType<any>[] | null,
  config: SnapshotConfig,
  userPubkey: string | null,
  options?: {
    undoConfig?: UndoConfig;
    onSave?: (snapshot: Snapshot) => Promise<void>;
    onRestore?: (versionId: string) => void;
    initialHistory?: VersionHistory;
    loadSnapshot?: (versionId: string) => Promise<Snapshot | null>;
  }
): {
  // Undo/redo
  undoState: UndoState;
  undo: () => void;
  redo: () => void;
  clearUndoHistory: () => void;
  // Snapshots
  history: VersionHistory | null;
  currentVersion: VersionInfo | null;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  autoSaveEnabled: boolean;
  isSaving: boolean;
  saveSnapshot: (saveOptions?: SaveSnapshotOptions) => Promise<VersionInfo | null>;
  restoreVersion: (versionId: string) => Promise<boolean>;
  setAutoSave: (enabled: boolean) => void;
} {
  const {
    state: undoState,
    undo,
    redo,
    clear: clearUndoHistory,
  } = useUndo(doc, scope, options?.undoConfig);

  const {
    history,
    currentVersion,
    hasUnsavedChanges,
    lastSavedAt,
    autoSaveEnabled,
    isSaving,
    saveSnapshot,
    restoreVersion,
    setAutoSave,
  } = useSnapshots(doc, config, userPubkey, {
    onSave: options?.onSave,
    onRestore: options?.onRestore,
    initialHistory: options?.initialHistory,
    loadSnapshot: options?.loadSnapshot,
  });

  return {
    undoState,
    undo,
    redo,
    clearUndoHistory,
    history,
    currentVersion,
    hasUnsavedChanges,
    lastSavedAt,
    autoSaveEnabled,
    isSaving,
    saveSnapshot,
    restoreVersion,
    setAutoSave,
  };
}

/**
 * Simple hook for keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
 */
export function useVersioningKeyboard(
  undo: () => void,
  redo: () => void,
  save?: () => void,
  options?: {
    enabled?: boolean;
  }
): void {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (!modifier) return;

      // Ctrl/Cmd + Z = Undo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
      // Ctrl/Cmd + S = Save
      else if (e.key === 's' && save) {
        e.preventDefault();
        save();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, save, enabled]);
}
