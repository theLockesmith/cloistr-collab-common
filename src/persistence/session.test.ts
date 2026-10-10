import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Relay } from 'nostr-tools';
import {
  createPersistenceSession,
  initialSessionState,
  type PersistenceSessionState,
} from './session.js';
import { LoadTimeoutError } from './types.js';

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return { ...actual, Relay: { connect: vi.fn() } };
});

vi.mock('../relay/bounded-publish.js', () => ({
  boundedPublish: vi.fn().mockResolvedValue(undefined),
  boundedAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../relay/created-at.js', () => ({
  nextCreatedAt: vi.fn().mockReturnValue(Math.floor(Date.now() / 1000)),
}));

function mockSigner() {
  return {
    getPublicKey: vi.fn().mockResolvedValue('pk-' + 'a'.repeat(60)),
    signEvent: vi.fn().mockImplementation(async (e: any) => ({
      ...e, id: 'eid', sig: 'esig',
    })),
  };
}

function testConfig(extra: Record<string, unknown> = {}) {
  return {
    documentId: 'test-doc',
    blossomUrl: 'https://blossom.test',
    relayUrl: 'wss://relay.test',
    signer: mockSigner(),
    ...extra,
  };
}

function patchBlobStore(p: any): void {
  const emptyState = Y.encodeStateAsUpdate(new Y.Doc());
  p.blobStore = {
    upload: vi.fn().mockResolvedValue({ hash: 'testhash', size: 100 }),
    download: vi.fn().mockResolvedValue(emptyState),
  };
}

function silentRelay() {
  const relay = {
    subscribe: vi.fn().mockImplementation((_f: any, _cb: any) => {
      return { close: vi.fn() };
    }),
    close: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };
  (Relay.connect as any).mockResolvedValue(relay);
  return relay;
}

function relayWithEose(scenario: 'found' | 'empty') {
  const relay = {
    subscribe: vi.fn().mockImplementation((_f: any, cb: any) => {
      const sub = { close: vi.fn() };
      if (scenario === 'found') {
        queueMicrotask(() => {
          cb.onevent({
            id: 'ev1', kind: 30078, pubkey: 'pk-' + 'a'.repeat(60),
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'test-doc']],
            content: JSON.stringify({
              hash: 'blobhash', size: 10,
              mimeType: 'application/x-yjs-update',
              timestamp: Date.now(), encrypted: false, appVersion: '1.0.0',
            }),
          });
          queueMicrotask(() => cb.oneose());
        });
      } else {
        queueMicrotask(() => cb.oneose());
      }
      return sub;
    }),
    close: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  };
  (Relay.connect as any).mockResolvedValue(relay);
  return relay;
}

function stateTracker() {
  let state = initialSessionState();
  const statusHistory: PersistenceSessionState['loadStatus'][] = [state.loadStatus];
  const update = (fn: (prev: PersistenceSessionState) => PersistenceSessionState) => {
    state = fn(state);
    if (statusHistory[statusHistory.length - 1] !== state.loadStatus) {
      statusHistory.push(state.loadStatus);
    }
  };
  return { get: () => state, update, statusHistory };
}

describe('createPersistenceSession', () => {
  afterEach(() => vi.clearAllMocks());

  it('starts idle', () => {
    const s = initialSessionState();
    expect(s.loadStatus).toBe('idle');
    expect(s.loadError).toBeNull();
    expect(s.saving).toBe(false);
    expect(s.error).toBeNull();
  });

  it('load transitions to loaded on success', async () => {
    relayWithEose('empty');
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    await session.load();
    expect(tracker.get().loadStatus).toBe('loaded');
    expect(tracker.get().loadError).toBeNull();
    session.destroy();
  });

  it('load transitions to loaded on found snapshot', async () => {
    relayWithEose('found');
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    await session.load();
    expect(tracker.get().loadStatus).toBe('loaded');
    session.destroy();
  });

  it('silent relay transitions to failed with LoadTimeoutError', async () => {
    vi.useFakeTimers();
    silentRelay();
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    const loadPromise = session.load();
    expect(tracker.get().loadStatus).toBe('loading');
    const assertion = expect(loadPromise).rejects.toThrow(LoadTimeoutError);
    await vi.advanceTimersByTimeAsync(11000);
    await assertion;
    expect(tracker.get().loadStatus).toBe('failed');
    expect(tracker.get().loadError).toBeInstanceOf(LoadTimeoutError);
    expect(tracker.statusHistory).not.toContain('loaded');
    expect(tracker.statusHistory).toEqual(['idle', 'loading', 'failed']);
    vi.useRealTimers();
    session.destroy();
  });

  it('load error goes to loadError, NOT to error', async () => {
    vi.useFakeTimers();
    silentRelay();
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    const loadPromise = session.load();
    const assertion = expect(loadPromise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(11000);
    await assertion;
    expect(tracker.get().loadError).toBeTruthy();
    expect(tracker.get().error).toBeNull();
    vi.useRealTimers();
    session.destroy();
  });

  it('save-before-load rejects and resets saving', async () => {
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    await expect(session.save()).rejects.toThrow(/load/i);
    expect(tracker.get().saving).toBe(false);
    expect(tracker.get().error).toBeTruthy();
    session.destroy();
  });

  it('failed save clears saving and keeps loaded', async () => {
    relayWithEose('empty');
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    await session.load();
    expect(tracker.get().loadStatus).toBe('loaded');
    (session.persistence as any).blobStore.upload.mockRejectedValueOnce(
      new Error('upload boom'),
    );
    await expect(session.save()).rejects.toThrow(/upload boom/i);
    expect(tracker.get().saving).toBe(false);
    expect(tracker.get().loadStatus).toBe('loaded');
    session.destroy();
  });

  it('successful save clears error', async () => {
    relayWithEose('empty');
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    await session.load();
    (session.persistence as any).blobStore.upload.mockRejectedValueOnce(
      new Error('transient'),
    );
    await expect(session.save()).rejects.toThrow();
    expect(tracker.get().error).toBeTruthy();
    await session.save();
    expect(tracker.get().saving).toBe(false);
    expect(tracker.get().error).toBeNull();
    session.destroy();
  });

  it('save error goes to error, NOT to loadError', async () => {
    relayWithEose('empty');
    const doc = new Y.Doc();
    const tracker = stateTracker();
    const session = createPersistenceSession(doc, testConfig(), tracker.update);
    patchBlobStore(session.persistence);
    await session.init();
    await session.load();
    (session.persistence as any).blobStore.upload.mockRejectedValueOnce(
      new Error('save boom'),
    );
    await expect(session.save()).rejects.toThrow();
    expect(tracker.get().error).toBeTruthy();
    expect(tracker.get().loadError).toBeNull();
    session.destroy();
  });
});
