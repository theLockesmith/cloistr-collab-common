import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Relay } from 'nostr-tools';
import { DocumentPersistence } from './DocumentPersistence.js';
import { RelayRejectionError, UploadTimeoutError } from './types.js';

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return { ...actual, Relay: { connect: vi.fn() } };
});

vi.mock('../relay/bounded-publish.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../relay/bounded-publish.js')>();
  return {
    ...actual,
    boundedPublish: vi.fn().mockResolvedValue(undefined),
    boundedAuth: vi.fn().mockResolvedValue(undefined),
  };
});

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

async function loadedPersistence() {
  relayWithEose('empty');
  const doc = new Y.Doc();
  const p = new DocumentPersistence(doc, testConfig());
  patchBlobStore(p);
  await p.init();
  await p.load();
  return p;
}

describe('relay rejection mapping', () => {
  afterEach(() => vi.clearAllMocks());

  it('rate-limited rejection surfaces as RelayRejectionError', async () => {
    vi.useFakeTimers();
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const p = await loadedPersistence();
    (boundedPublish as any).mockRejectedValue(new Error('rate-limited: too many events'));
    relayWithEose('empty');
    const savePromise = p.save();
    const assertion = expect(savePromise).rejects.toThrow(RelayRejectionError);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    vi.useRealTimers();
    p.destroy();
  });

  it('other relay rejection (blocked:) surfaces as RelayRejectionError', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const p = await loadedPersistence();
    (boundedPublish as any).mockRejectedValueOnce(new Error('blocked: event rejected'));
    relayWithEose('empty');
    await expect(p.save()).rejects.toThrow(RelayRejectionError);
    p.destroy();
  });

  it('relay rejection error includes the reason string', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const p = await loadedPersistence();
    (boundedPublish as any).mockRejectedValueOnce(new Error('blocked: not on allowlist'));
    relayWithEose('empty');
    try {
      await p.save();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RelayRejectionError);
      expect((e as RelayRejectionError).reason).toBe('blocked: not on allowlist');
    }
    p.destroy();
  });
});

describe('rate-limited retry with backoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('retries on rate-limited and succeeds', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const p = await loadedPersistence();
    // Fail twice with rate-limited, then succeed
    (boundedPublish as any)
      .mockRejectedValueOnce(new Error('rate-limited: slow down'))
      .mockRejectedValueOnce(new Error('rate-limited: slow down'))
      .mockResolvedValueOnce(undefined);
    relayWithEose('empty');
    const savePromise = p.save();
    // Advance past backoff delays
    await vi.advanceTimersByTimeAsync(10000);
    const result = await savePromise;
    expect(result.hash).toBe('testhash');
    // boundedPublish called 3 times total (2 retries + 1 success)
    const publishCalls = (boundedPublish as any).mock.calls;
    expect(publishCalls.length).toBeGreaterThanOrEqual(3);
    p.destroy();
  });

  it('gives up after max retries on rate-limited', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const p = await loadedPersistence();
    (boundedPublish as any).mockRejectedValue(new Error('rate-limited: overloaded'));
    relayWithEose('empty');
    const savePromise = p.save();
    const assertion = expect(savePromise).rejects.toThrow(RelayRejectionError);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    p.destroy();
  });
});

describe('upload timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('hanging upload fails with UploadTimeoutError', async () => {
    relayWithEose('empty');
    const doc = new Y.Doc();
    const p = new DocumentPersistence(doc, testConfig());
    patchBlobStore(p);
    (p as any).blobStore.upload.mockImplementation(() => new Promise(() => {}));
    await p.init();
    await p.load();
    const savePromise = p.save();
    const assertion = expect(savePromise).rejects.toThrow(UploadTimeoutError);
    await vi.advanceTimersByTimeAsync(61000);
    await assertion;
    p.destroy();
  });
});
