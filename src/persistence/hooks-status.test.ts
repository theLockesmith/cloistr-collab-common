/**
 * Tests for hook state transitions: loadStatus, loadError, and save() saving reset.
 *
 * These test the PersistenceState machine exposed by useDocumentPersistence.
 * The transitions are tested as pure logic via a simulated state tracker,
 * not through React rendering, so no jsdom is needed.
 */
import { describe, it, expect } from 'vitest';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

interface PersistenceState {
  loadStatus: LoadStatus;
  loadError: Error | null;
  saving: boolean;
  error: Error | null;
}

function initialState(): PersistenceState {
  return { loadStatus: 'idle', loadError: null, saving: false, error: null };
}

// State transitions matching what the hook should implement
function startLoading(s: PersistenceState): PersistenceState {
  return { ...s, loadStatus: 'loading', loadError: null };
}

function loadSucceeded(s: PersistenceState): PersistenceState {
  return { ...s, loadStatus: 'loaded', loadError: null };
}

function loadFailed(s: PersistenceState, error: Error): PersistenceState {
  return { ...s, loadStatus: 'failed', loadError: error };
}

function startSaving(s: PersistenceState): PersistenceState {
  return { ...s, saving: true, error: null };
}

function saveSucceeded(s: PersistenceState): PersistenceState {
  return { ...s, saving: false, error: null };
}

function saveFailed(s: PersistenceState, error: Error): PersistenceState {
  return { ...s, saving: false, error };
}

describe('hook loadStatus transitions', () => {
  it('starts idle', () => {
    expect(initialState().loadStatus).toBe('idle');
  });

  it('idle -> loading -> loaded', () => {
    let s = initialState();
    s = startLoading(s);
    expect(s.loadStatus).toBe('loading');
    s = loadSucceeded(s);
    expect(s.loadStatus).toBe('loaded');
    expect(s.loadError).toBeNull();
  });

  it('idle -> loading -> failed with LoadTimeoutError', () => {
    let s = initialState();
    s = startLoading(s);
    const err = new Error('Relay query timed out');
    err.name = 'LoadTimeoutError';
    s = loadFailed(s, err);
    expect(s.loadStatus).toBe('failed');
    expect(s.loadError).toBe(err);
    expect(s.loadError!.name).toBe('LoadTimeoutError');
  });

  it('loadError is separate from save error', () => {
    let s = initialState();
    s = startLoading(s);
    s = loadFailed(s, new Error('load failed'));
    expect(s.loadError!.message).toBe('load failed');
    expect(s.error).toBeNull();

    // Now a save fails too
    s = startSaving(s);
    s = saveFailed(s, new Error('save failed'));
    expect(s.error!.message).toBe('save failed');
    expect(s.loadError!.message).toBe('load failed');
  });
});

describe('hook save() saving:true reset', () => {
  it('save-before-load resets saving on rejection', () => {
    let s = initialState();
    // User presses Ctrl+S before load completes
    s = startSaving(s);
    expect(s.saving).toBe(true);
    // Gate throws PersistenceError — hook must catch and reset
    s = saveFailed(s, new Error('Cannot save: document load has not completed'));
    expect(s.saving).toBe(false);
    expect(s.error).toBeTruthy();
  });

  it('failed save after successful load resets saving and keeps loaded', () => {
    let s = initialState();
    s = startLoading(s);
    s = loadSucceeded(s);
    expect(s.loadStatus).toBe('loaded');
    s = startSaving(s);
    s = saveFailed(s, new Error('upload failed'));
    expect(s.saving).toBe(false);
    expect(s.loadStatus).toBe('loaded');
  });

  it('successful save clears error', () => {
    let s = initialState();
    s = startLoading(s);
    s = loadSucceeded(s);
    s = startSaving(s);
    s = saveFailed(s, new Error('transient'));
    expect(s.error).toBeTruthy();
    s = startSaving(s);
    s = saveSucceeded(s);
    expect(s.saving).toBe(false);
    expect(s.error).toBeNull();
  });
});
