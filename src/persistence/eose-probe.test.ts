import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Relay } from 'nostr-tools';
import { DocumentPersistence } from './DocumentPersistence.js';
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

function patchBlobStore(p: DocumentPersistence): void {
  const emptyState = Y.encodeStateAsUpdate(new Y.Doc());
  (p as any).blobStore = {
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

describe('EOSE-vs-silence probe', () => {
  afterEach(() => vi.clearAllMocks());

  it('silent relay produces LoadTimeoutError (not found:false, not wrapped PersistenceError)', async () => {
    vi.useFakeTimers();
    silentRelay();
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    await p.init();
    const loadPromise = p.load();
    const assertion = expect(loadPromise).rejects.toThrow(LoadTimeoutError);
    await vi.advanceTimersByTimeAsync(11000);
    await assertion;
    vi.useRealTimers();
    p.destroy();
  });

  it('eoseTimeout on subscription is set high to prevent synthetic EOSE', async () => {
    vi.useFakeTimers();
    const relay = silentRelay();
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    await p.init();
    const loadPromise = p.load();
    // Flush microtasks so Relay.connect() resolves and subscribe() is called
    await vi.advanceTimersByTimeAsync(0);
    const subscribeCall = relay.subscribe.mock.calls[0];
    expect(subscribeCall).toBeDefined();
    const opts = subscribeCall[1];
    expect(opts.eoseTimeout).toBeGreaterThanOrEqual(100000);
    const assertion = expect(loadPromise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(11000);
    await assertion;
    vi.useRealTimers();
    p.destroy();
  });

  it('real EOSE with no events still returns found:false', async () => {
    relayWithEose('empty');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    const result = await p.load();
    expect(result.found).toBe(false);
    p.destroy();
  });

  it('real EOSE with events returns the snapshot', async () => {
    relayWithEose('found');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    const result = await p.load();
    expect(result.found).toBe(true);
    p.destroy();
  });
});

