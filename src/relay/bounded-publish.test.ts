import { describe, it, expect, vi } from 'vitest';
import type { Event, UnsignedEvent, VerifiedEvent, Relay } from 'nostr-tools';

import {
  boundedPublish,
  boundedAuth,
  AuthSignerError,
  PublishTimeoutError,
  PUBLISH_TIMEOUT_MS,
  AUTH_TIMEOUT_MS,
} from './bounded-publish.js';

function fakeRelay(overrides: Partial<Relay> = {}): Relay {
  return {
    publish: vi.fn(async () => {}),
    auth: vi.fn(async () => ''),
    ...overrides,
  } as unknown as Relay;
}

describe('boundedPublish', () => {
  it('resolves when relay.publish settles within the timeout', async () => {
    const relay = fakeRelay();
    await expect(boundedPublish(relay, {} as Event)).resolves.toBeUndefined();
    expect(relay.publish).toHaveBeenCalledOnce();
  });

  it('rejects with PublishTimeoutError when relay.publish never settles', async () => {
    const relay = fakeRelay({ publish: vi.fn(() => new Promise(() => {})) });
    await expect(boundedPublish(relay, {} as Event, 50)).rejects.toThrow(PublishTimeoutError);
  });

  it('PublishTimeoutError carries the timeout duration', async () => {
    const relay = fakeRelay({ publish: vi.fn(() => new Promise(() => {})) });
    const err = await boundedPublish(relay, {} as Event, 50).catch((e: Error) => e);
    expect(err).toBeInstanceOf(PublishTimeoutError);
    expect(err.message).toMatch(/50ms/);
  });

  it('surfaces the relay rejection unchanged when publish rejects within the timeout', async () => {
    const relay = fakeRelay({
      publish: vi.fn(async () => { throw new Error('blocked: pubkey not allowed'); }),
    });
    await expect(boundedPublish(relay, {} as Event)).rejects.toThrow('blocked: pubkey not allowed');
  });
});

describe('boundedAuth', () => {
  it('resolves when relay.auth settles within the timeout', async () => {
    const relay = fakeRelay();
    const cb = async () => ({} as VerifiedEvent);
    await expect(boundedAuth(relay, cb)).resolves.toBeUndefined();
    expect(relay.auth).toHaveBeenCalledOnce();
  });

  it('rejects with AuthSignerError when the signer callback throws', async () => {
    const relay = fakeRelay({
      auth: vi.fn(async (cb: (evt: any) => Promise<VerifiedEvent>) => {
        await cb({ kind: 22242, created_at: 0, tags: [], content: '' });
        return '';
      }),
    });
    const refusingCb = async (evt: any) => {
      throw new Error('will not sign NIP-42 auth events');
    };
    const err = await boundedAuth(relay, refusingCb).catch((e: Error) => e);
    expect(err).toBeInstanceOf(AuthSignerError);
    expect(err.message).toMatch(/will not sign/);
  });

  it('rejects with AuthSignerError when relay.auth never settles (signer hang)', async () => {
    const relay = fakeRelay({ auth: vi.fn(() => new Promise(() => {})) });
    const cb = async () => ({} as VerifiedEvent);
    await expect(boundedAuth(relay, cb, 50)).rejects.toThrow(AuthSignerError);
  });

  it('AuthSignerError timeout message names the timeout', async () => {
    const relay = fakeRelay({ auth: vi.fn(() => new Promise(() => {})) });
    const err = await boundedAuth(relay, async () => ({} as VerifiedEvent), 50).catch((e: Error) => e);
    expect(err).toBeInstanceOf(AuthSignerError);
    expect(err.message).toMatch(/timed out/);
  });

  it('the default timeouts are sensible bounds', () => {
    expect(PUBLISH_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(PUBLISH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(AUTH_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(AUTH_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});

// ── Pool-level bounded publish ─────────────────────────────────────────────

import {
  boundedPoolPublish,
  settlePoolPublish,
  type PublishablePool,
  type PoolPublishResult,
} from './bounded-publish.js';

function fakePool(
  publishFn: (relays: string[], event: Event, params?: any) => Promise<string>[]
): PublishablePool {
  return { publish: publishFn };
}

describe('boundedPoolPublish', () => {
  const relays = ['wss://a.example', 'wss://b.example'];
  const event = {} as Event;

  it('passes events through when pool.publish settles normally', async () => {
    const pool = fakePool(() => [
      Promise.resolve('ok-a'),
      Promise.resolve('ok-b'),
    ]);
    const results = boundedPoolPublish(pool, relays, event);
    expect(results).toHaveLength(2);
    await expect(results[0]).resolves.toBe('ok-a');
    await expect(results[1]).resolves.toBe('ok-b');
  });

  it('rejects with PublishTimeoutError when a relay publish hangs', async () => {
    const pool = fakePool(() => [
      Promise.resolve('ok'),
      new Promise(() => {}),
    ]);
    const results = boundedPoolPublish(pool, relays, event, { timeoutMs: 50 });
    await expect(results[0]).resolves.toBe('ok');
    await expect(results[1]).rejects.toThrow(PublishTimeoutError);
  });

  it('wraps onauth with AuthSignerError timeout when signer hangs', async () => {
    const pool = fakePool((_relays, _event, params) => [
      (async () => {
        // Simulate relay asking for auth with a hanging signer
        await params?.onauth?.({ kind: 22242, created_at: 0, tags: [], content: '' });
        return 'ok';
      })(),
    ]);
    const hangingAuth = async () => new Promise<VerifiedEvent>(() => {});
    const results = boundedPoolPublish(pool, ['wss://a.example'], event, {
      onauth: hangingAuth,
      authTimeoutMs: 50,
    });
    const err = await results[0].catch((e: Error) => e);
    expect(err).toBeInstanceOf(AuthSignerError);
    expect(err.message).toMatch(/timed out/);
  });

  it('surfaces signer refusal as AuthSignerError', async () => {
    const pool = fakePool((_relays, _event, params) => [
      (async () => {
        await params?.onauth?.({ kind: 22242, created_at: 0, tags: [], content: '' });
        return 'ok';
      })(),
    ]);
    const refusingAuth = async () => {
      throw new Error('will not sign NIP-42');
    };
    const results = boundedPoolPublish(pool, ['wss://a.example'], event, {
      onauth: refusingAuth,
    });
    const err = await results[0].catch((e: Error) => e);
    expect(err).toBeInstanceOf(AuthSignerError);
    expect(err.message).toMatch(/will not sign/);
  });

  it('forwards pool rejections unchanged when not a timeout', async () => {
    const pool = fakePool(() => [
      Promise.reject(new Error('blocked: not allowed')),
    ]);
    const results = boundedPoolPublish(pool, ['wss://a.example'], event);
    await expect(results[0]).rejects.toThrow('blocked: not allowed');
  });

  it('returns empty array when no relays are given', async () => {
    const pool = fakePool(() => []);
    const results = boundedPoolPublish(pool, [], event);
    expect(results).toHaveLength(0);
    const settled = await settlePoolPublish([], results);
    expect(settled).toEqual({ accepted: [], rejected: [], timedOut: [] });
  });

  it('works without onauth', async () => {
    const publishSpy = vi.fn(() => [Promise.resolve('ok')]);
    const pool = fakePool(publishSpy);
    const results = boundedPoolPublish(pool, ['wss://a.example'], event);
    await expect(results[0]).resolves.toBe('ok');
    expect(publishSpy).toHaveBeenCalledWith(
      ['wss://a.example'],
      event,
      { onauth: undefined }
    );
  });
});

describe('settlePoolPublish', () => {
  it('partitions settled promises into accepted/rejected/timedOut', async () => {
    const relays = ['wss://ok', 'wss://bad', 'wss://slow'];
    // Defer rejections so allSettled catches them before the unhandled-rejection handler
    const promises: Promise<string>[] = [
      Promise.resolve('accepted'),
      Promise.resolve().then(() => { throw new Error('blocked'); }),
      Promise.resolve().then(() => { throw new PublishTimeoutError(15_000); }),
    ];
    const result = await settlePoolPublish(relays, promises);
    expect(result.accepted).toEqual(['wss://ok']);
    expect(result.rejected).toEqual([{ relay: 'wss://bad', reason: 'blocked' }]);
    expect(result.timedOut).toEqual(['wss://slow']);
  });

  it('returns all-accepted when everything succeeds', async () => {
    const relays = ['wss://a', 'wss://b'];
    const promises = [Promise.resolve('ok'), Promise.resolve('ok')];
    const result = await settlePoolPublish(relays, promises);
    expect(result.accepted).toEqual(['wss://a', 'wss://b']);
    expect(result.rejected).toEqual([]);
    expect(result.timedOut).toEqual([]);
  });
});
