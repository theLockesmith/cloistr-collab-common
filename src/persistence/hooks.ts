/**
 * React hooks for document persistence
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { DocumentPersistence } from './DocumentPersistence.js';
import type { PersistenceConfig, SaveResult, LoadResult } from './types.js';

/**
 * Persistence state
 */
export interface PersistenceState {
  /** Whether persistence is initialized */
  initialized: boolean;
  /** Whether currently saving */
  saving: boolean;
  /** Whether currently loading */
  loading: boolean;
  /** Whether document has unsaved changes */
  dirty: boolean;
  /** Last save result */
  lastSave: SaveResult | null;
  /** Last error */
  error: Error | null;
}

/**
 * Persistence controls
 */
export interface PersistenceControls {
  /** Save the document */
  save: () => Promise<SaveResult>;
  /** Load the document */
  load: () => Promise<LoadResult>;
  /** Check if snapshot exists */
  exists: () => Promise<boolean>;
  /** Enable auto-save */
  enableAutoSave: (intervalMs: number) => void;
  /** Disable auto-save */
  disableAutoSave: () => void;
}

/**
 * Hook for document persistence
 */
export function useDocumentPersistence(
  doc: Y.Doc | null,
  config: Omit<PersistenceConfig, 'autoSaveInterval'> | null,
  options?: {
    /** Auto-load on mount */
    autoLoad?: boolean;
    /** Auto-save interval (0 = disabled) */
    autoSaveInterval?: number;
  }
): [PersistenceState, PersistenceControls] {
  const [state, setState] = useState<PersistenceState>({
    initialized: false,
    saving: false,
    loading: false,
    dirty: false,
    lastSave: null,
    error: null,
  });

  const persistenceRef = useRef<DocumentPersistence | null>(null);

  // Initialize persistence
  useEffect(() => {
    if (!doc || !config) {
      return;
    }

    const persistence = new DocumentPersistence(doc, {
      ...config,
      autoSaveInterval: options?.autoSaveInterval ?? 0,
    });

    persistence.onSave = (result) => {
      setState(prev => ({
        ...prev,
        saving: false,
        dirty: false,
        lastSave: result,
        error: null,
      }));
    };

    persistence.onLoad = () => {
      setState(prev => ({
        ...prev,
        loading: false,
        dirty: false,
        error: null,
      }));
    };

    persistence.onError = (error) => {
      setState(prev => ({
        ...prev,
        saving: false,
        loading: false,
        error,
      }));
    };

    // Track dirty state
    const checkDirty = () => {
      setState(prev => ({
        ...prev,
        dirty: persistence.hasUnsavedChanges(),
      }));
    };

    doc.on('update', checkDirty);

    // Initialize
    persistence.init().then(() => {
      persistenceRef.current = persistence;
      setState(prev => ({ ...prev, initialized: true }));

      // Auto-load if enabled
      if (options?.autoLoad) {
        setState(prev => ({ ...prev, loading: true }));
        persistence.load().catch(() => {
          // Ignore load errors for new documents
        });
      }
    });

    return () => {
      doc.off('update', checkDirty);
      persistence.destroy();
      persistenceRef.current = null;
    };
  }, [doc, config?.documentId, config?.blossomUrl, config?.relayUrl]);

  const save = useCallback(async (): Promise<SaveResult> => {
    const persistence = persistenceRef.current;
    if (!persistence) {
      throw new Error('Persistence not initialized');
    }

    setState(prev => ({ ...prev, saving: true, error: null }));
    return persistence.save();
  }, []);

  const load = useCallback(async (): Promise<LoadResult> => {
    const persistence = persistenceRef.current;
    if (!persistence) {
      throw new Error('Persistence not initialized');
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    return persistence.load();
  }, []);

  const exists = useCallback(async (): Promise<boolean> => {
    const persistence = persistenceRef.current;
    if (!persistence) {
      return false;
    }
    return persistence.exists();
  }, []);

  const enableAutoSave = useCallback((intervalMs: number) => {
    persistenceRef.current?.startAutoSave(intervalMs);
  }, []);

  const disableAutoSave = useCallback(() => {
    persistenceRef.current?.stopAutoSave();
  }, []);

  const controls: PersistenceControls = {
    save,
    load,
    exists,
    enableAutoSave,
    disableAutoSave,
  };

  return [state, controls];
}

/**
 * Hook for simple save/load UI (save button with indicator)
 */
export function usePersistenceUI(
  doc: Y.Doc | null,
  config: Omit<PersistenceConfig, 'autoSaveInterval'> | null
) {
  const [state, controls] = useDocumentPersistence(doc, config, {
    autoLoad: true,
    autoSaveInterval: 30000, // Auto-save every 30 seconds
  });

  const saveButtonProps = {
    disabled: !state.initialized || state.saving || !state.dirty,
    onClick: () => controls.save(),
    children: state.saving ? 'Saving...' : state.dirty ? 'Save' : 'Saved',
  };

  return {
    state,
    controls,
    saveButtonProps,
  };
}
