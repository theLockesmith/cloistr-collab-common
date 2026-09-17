import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextCreatedAt, _resetCreatedAtState } from './created-at.js';

beforeEach(() => {
  _resetCreatedAtState();
  vi.restoreAllMocks();
});

describe('nextCreatedAt', () => {
  it('returns the wall clock when the address has not been seen', () => {
    const now = Math.floor(Date.now() / 1000);
    const ts = nextCreatedAt('30023:abc:my-page');
    expect(ts).toBeGreaterThanOrEqual(now);
    expect(ts).toBeLessThanOrEqual(now + 1);
  });

  it('gives a second edit in the same second a later timestamp than the first', () => {
    const first = nextCreatedAt('30023:abc:my-page');
    const second = nextCreatedAt('30023:abc:my-page');
    expect(second).toBeGreaterThan(first);
  });

  it('does not push a different address forward', () => {
    const now = Math.floor(Date.now() / 1000);
    nextCreatedAt('30023:abc:page-one');
    const second = nextCreatedAt('30023:abc:page-two');
    expect(second).toBeLessThanOrEqual(now + 1);
  });

  it('returns to the wall clock once the clock catches up', () => {
    const realNow = Date.now;
    let fakeMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => fakeMs);

    const first = nextCreatedAt('30023:abc:page');
    const second = nextCreatedAt('30023:abc:page');
    expect(second).toBe(first + 1);

    fakeMs += 5000;
    const third = nextCreatedAt('30023:abc:page');
    expect(third).toBe(Math.floor(fakeMs / 1000));

    Date.now = realNow;
  });
});
