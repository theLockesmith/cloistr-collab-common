/**
 * React hooks for document persistence
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { DocumentPersistence } from './DocumentPersistence.js';
import type { PersistenceConfig, SaveResult, LoadResult } from './types.js';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

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
  /** Load lifecycle: idle -> loading -> loaded | failed */
  loadStatus: LoadStatus;
  /** Load error, separate from save errors */
  loadError: Error | null;
  /** Whether document has unsaved changes */
  dirty: boolean;
  /** Last save result */
  lastSave: SaveResult | null;
  /** Last save error (load errors go in loadError) */
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
    /** Active pubkey: triggers re-init when identity changes */
    activePubkey?: string | null;
  }
): [PersistenceState, PersistenceControls] {
  const [state, setState] = useState<PersistenceState>({
    initialized: false,
    saving: false,
    loading: false,
    loadStatus: 'idle',
    loadError: null,
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
        loadStatus: 'loaded',
        loadError: null,
        dirty: false,
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

      if (options?.autoLoad) {
        setState(prev => ({ ...prev, loading: true, loadStatus: 'loading' }));
        persistence.load()
          .then(() => {
            setState(prev => ({
              ...prev,
              loading: false,
              loadStatus: 'loaded',
              loadError: null,
              dirty: false,
            }));
          })
          .catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            setState(prev => ({
              ...prev,
              loading: false,
              loadStatus: 'failed',
              loadError: err,
            }));
          });
      }
    });

    return () => {
      doc.off('update', checkDirty);
      persistence.destroy();
      persistenceRef.current = null;
    };
  }, [doc, config?.documentId, config?.blossomUrl, config?.relayUrl, options?.activePubkey]);

  const save = useCallback(async (): Promise<SaveResult> => {
    const persistence = persistenceRef.current;
    if (!persistence) {
      throw new Error('Persistence not initialized');
    }

    setState(prev => ({ ...prev, saving: true, error: null }));
    try {
      return await persistence.save();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, saving: false, error: err }));
      throw error;
    }
  }, []);

  const load = useCallback(async (): Promise<LoadResult> => {
    const persistence = persistenceRef.current;
    if (!persistence) {
      throw new Error('Persistence not initialized');
    }

    setState(prev => ({ ...prev, loading: true, loadStatus: 'loading', loadError: null }));
    try {
      const result = await persistence.load();
      setState(prev => ({
        ...prev,
        loading: false,
        loadStatus: 'loaded',
        loadError: null,
        dirty: false,
      }));
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({
        ...prev,
        loading: false,
        loadStatus: 'failed',
        loadError: err,
      }));
      throw error;
    }
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
    autoSaveInterval: 30000,
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
