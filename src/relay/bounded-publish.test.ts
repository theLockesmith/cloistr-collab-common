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
