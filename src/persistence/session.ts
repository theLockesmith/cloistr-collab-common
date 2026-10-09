import * as Y from 'yjs';
import { DocumentPersistence } from './DocumentPersistence.js';
import type { PersistenceConfig, SaveResult, LoadResult } from './types.js';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface PersistenceSessionState {
  loadStatus: LoadStatus;
  loadError: Error | null;
  saving: boolean;
  error: Error | null;
  dirty: boolean;
  lastSave: SaveResult | null;
}

export function initialSessionState(): PersistenceSessionState {
  return {
    loadStatus: 'idle',
    loadError: null,
    saving: false,
    error: null,
    dirty: false,
    lastSave: null,
  };
}

export interface PersistenceSession {
  load: () => Promise<LoadResult>;
  save: () => Promise<SaveResult>;
  init: () => Promise<void>;
  destroy: () => void;
  persistence: DocumentPersistence;
}

export function createPersistenceSession(
  doc: Y.Doc,
  config: PersistenceConfig,
  update: (fn: (prev: PersistenceSessionState) => PersistenceSessionState) => void,
): PersistenceSession {
  const persistence = new DocumentPersistence(doc, config);

  persistence.onSave = (result) => {
    update((prev) => ({
      ...prev,
      saving: false,
      dirty: false,
      lastSave: result,
      error: null,
    }));
  };

  persistence.onLoad = () => {
    update((prev) => ({
      ...prev,
      loadStatus: 'loaded',
      loadError: null,
      dirty: false,
    }));
  };

  const load = async (): Promise<LoadResult> => {
    update((prev) => ({ ...prev, loadStatus: 'loading', loadError: null }));
    try {
      const result = await persistence.load();
      update((prev) => ({
        ...prev,
        loadStatus: 'loaded',
        loadError: null,
        dirty: false,
      }));
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      update((prev) => ({
        ...prev,
        loadStatus: 'failed',
        loadError: err,
      }));
      throw error;
    }
  };

  const save = async (): Promise<SaveResult> => {
    update((prev) => ({ ...prev, saving: true, error: null }));
    try {
      return await persistence.save();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      update((prev) => ({ ...prev, saving: false, error: err }));
      throw error;
    }
  };

  return {
    load,
    save,
    init: () => persistence.init(),
    destroy: () => persistence.destroy(),
    persistence,
  };
}
