import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Relay } from 'nostr-tools';
import { DocumentPersistence } from './DocumentPersistence.js';
import { PersistenceError } from './types.js';

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

function patchBlobStore(p: DocumentPersistence): void {
  const emptyState = Y.encodeStateAsUpdate(new Y.Doc());
  (p as any).blobStore = {
    upload: vi.fn().mockResolvedValue({ hash: 'testhash', size: 100 }),
    download: vi.fn().mockResolvedValue(emptyState),
  };
}

function relayWith(scenario: 'found' | 'empty' | 'timeout') {
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
      } else if (scenario === 'empty') {
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

describe('DocumentPersistence write gate', () => {
  afterEach(() => vi.clearAllMocks());

  it('save() rejects before load() completes', async () => {
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    await expect(p.save()).rejects.toThrow(/load/i);
    p.destroy();
  });

  it('save() works after load() finds a snapshot', async () => {
    relayWith('found');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    await p.load();
    const result = await p.save();
    expect(result.hash).toBeDefined();
    p.destroy();
  });

  it('save() works after load() returns found:false (new doc)', async () => {
    relayWith('empty');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    const lr = await p.load();
    expect(lr.found).toBe(false);
    const result = await p.save();
    expect(result.hash).toBeDefined();
    p.destroy();
  });

  it('auto-save does not fire before load', async () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig({ autoSaveInterval: 500 }));
    patchBlobStore(p);
    const uploadFn = (p as any).blobStore.upload;
    await p.init();
    doc.getMap('x').set('k', 'v');
    await vi.advanceTimersByTimeAsync(2000);
    expect(uploadFn).not.toHaveBeenCalled();
    vi.useRealTimers();
    p.destroy();
  });

  it('auto-save starts after load succeeds', async () => {
    relayWith('empty');
    const spy = vi.spyOn(globalThis, 'setInterval');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig({ autoSaveInterval: 5000 }));
    patchBlobStore(p);
    expect(spy).not.toHaveBeenCalled();
    await p.load();
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000);
    p.destroy();
  });
});

describe('fetchLatestSnapshotEvent timeout', () => {
  afterEach(() => vi.clearAllMocks());

  it('timeout produces an error, not an empty result', async () => {
    vi.useFakeTimers();
    relayWith('timeout');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    await p.init();
    const loadPromise = p.load();
    const assertion = expect(loadPromise).rejects.toThrow(/time/i);
    await vi.advanceTimersByTimeAsync(11000);
    await assertion;
    vi.useRealTimers();
    p.destroy();
  });
});
