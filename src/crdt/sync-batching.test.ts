import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Relay } from 'nostr-tools';
import { NostrSyncProvider } from './provider.js';

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return { ...actual, Relay: { connect: vi.fn() } };
});

vi.mock('../relay/bounded-publish.js', () => ({
  boundedPublish: vi.fn().mockResolvedValue(undefined),
  boundedAuth: vi.fn().mockResolvedValue(undefined),
}));

function mockSigner() {
  return {
    getPublicKey: vi.fn().mockResolvedValue('pk-' + 'a'.repeat(60)),
    signEvent: vi.fn().mockImplementation(async (e: any) => ({
      ...e, id: 'eid-' + Math.random().toString(36).slice(2, 8), sig: 'esig',
    })),
  };
}

function mockRelay() {
  const relay = {
    subscribe: vi.fn().mockImplementation((_f: any, cb: any) => {
      queueMicrotask(() => cb.oneose());
      return { close: vi.fn() };
    }),
    close: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    onclose: null as any,
  };
  (Relay.connect as any).mockResolvedValue(relay);
  return relay;
}

async function connectedProvider() {
  mockRelay();
  const doc = new Y.Doc();
  const provider = new NostrSyncProvider(doc, {
    signer: mockSigner(),
    relayUrl: 'wss://relay.test',
    docId: 'test-doc',
  });
  await provider.connect();
  await vi.advanceTimersByTimeAsync(0);
  return { doc, provider };
}

describe('sync batching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('N rapid updates produce at most ceil(duration/interval) events', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const { doc, provider } = await connectedProvider();

    const N = 60;
    for (let i = 0; i < N; i++) {
      doc.getText('content').insert(0, 'x');
      await vi.advanceTimersByTimeAsync(16);
    }
    await vi.advanceTimersByTimeAsync(500);

    const publishCalls = (boundedPublish as any).mock.calls.length;
    const durationMs = N * 16;
    const interval = 150;
    const maxExpected = Math.ceil(durationMs / interval) + 1;
    expect(publishCalls).toBeLessThanOrEqual(maxExpected);
    expect(publishCalls).toBeGreaterThan(0);
    expect(publishCalls).toBeLessThan(N);

    provider.destroy();
  });

  it('merged update round-trips to the same doc state', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const { doc, provider } = await connectedProvider();

    doc.getText('content').insert(0, 'hello');
    doc.getText('content').insert(5, ' world');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);

    const receiverDoc = new Y.Doc();
    for (const call of (boundedPublish as any).mock.calls) {
      const event = call[1];
      const payload = JSON.parse(event.content);
      const updateBytes = Uint8Array.from(atob(payload.update), c => c.charCodeAt(0));
      Y.applyUpdate(receiverDoc, updateBytes);
    }
    expect(receiverDoc.getText('content').toString()).toBe('hello world');

    provider.destroy();
  });

  it('single update when idle sends immediately', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const { doc, provider } = await connectedProvider();

    (boundedPublish as any).mockClear();
    doc.getText('content').insert(0, 'a');
    await vi.advanceTimersByTimeAsync(0);

    expect((boundedPublish as any).mock.calls.length).toBe(1);

    provider.destroy();
  });
});

describe('rate-limited re-send', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('rate-limited update is re-sent in the next flush', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const { doc, provider } = await connectedProvider();

    (boundedPublish as any)
      .mockRejectedValueOnce(new Error('rate-limited: too many events'))
      .mockResolvedValue(undefined);

    doc.getText('content').insert(0, 'lost?');
    await vi.advanceTimersByTimeAsync(0);
    expect((boundedPublish as any).mock.calls.length).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);

    const retryCall = (boundedPublish as any).mock.calls.at(-1);
    const event = retryCall[1];
    const payload = JSON.parse(event.content);
    const updateBytes = Uint8Array.from(atob(payload.update), c => c.charCodeAt(0));
    const receiverDoc = new Y.Doc();
    Y.applyUpdate(receiverDoc, updateBytes);
    expect(receiverDoc.getText('content').toString()).toBe('lost?');

    provider.destroy();
  });

  it('rejected and new updates merge into one re-send', async () => {
    const { boundedPublish } = await import('../relay/bounded-publish.js');
    const { doc, provider } = await connectedProvider();

    (boundedPublish as any)
      .mockRejectedValueOnce(new Error('rate-limited: slow down'))
      .mockResolvedValue(undefined);

    doc.getText('content').insert(0, 'first');
    await vi.advanceTimersByTimeAsync(0);

    doc.getText('content').insert(5, ' second');
    await vi.advanceTimersByTimeAsync(2000);

    const lastCall = (boundedPublish as any).mock.calls.at(-1);
    const event = lastCall[1];
    const payload = JSON.parse(event.content);
    const updateBytes = Uint8Array.from(atob(payload.update), c => c.charCodeAt(0));
    const receiverDoc = new Y.Doc();
    Y.applyUpdate(receiverDoc, updateBytes);
    expect(receiverDoc.getText('content').toString()).toBe('first second');

    provider.destroy();
  });
});
