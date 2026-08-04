import { describe, it, expect } from 'vitest';
import { isAuthRequired } from './relay-errors.js';

/**
 * Regression tests for DocumentPersistence relay interaction.
 *
 * ─── Bug 1: fetchLatestSnapshotEvent finally-block race (≤ 0.2.13) ───────────
 *
 *   try {
 *     return new Promise((resolve) => { ... oneose: () => resolve(found) ... });
 *   } finally {
 *     await relay.close();   // ← fires BEFORE the Promise settles
 *   }
 *
 * `return new Promise(...)` exits the try block the moment `return` is
 * evaluated — which is immediately, before the returned Promise resolves.
 * `finally` therefore fires right away. `relay.close()` calls
 * `closeAllSubscriptions()` synchronously, emptying `relay.openSubs`. The EOSE
 * message arrives later (macrotask), but `openSubs.get(subId)` is now undefined
 * and the handler is silently dropped. `resolve(found)` fires only from the
 * 10-second timeout, with `found` still null. Every reload returned a blank
 * canvas regardless of what had been saved.
 *
 * Fix (0.2.14): `const result = await new Promise(...)` — the async function
 * suspends until the Promise settles. EOSE calls `resolve(found)`, the Promise
 * resolves, and only then does `finally` run and close the relay.
 *
 * ─── Bug 2: publishSnapshotEvent auth-required not retried (≤ 0.2.13) ────────
 *
 *   await relay.publish(signedEvent); // throws "auth-required: ..."
 *   // propagated up; relay.close() still runs via finally
 *   // pointer event never published; blob orphaned in Blossom
 *
 * Cloistr's relay requires NIP-42 auth before publishing kind-30078 events.
 * The rejection was surfaced to the caller without any retry, so Blossom
 * received the blob but the Nostr pointer was never published. On reload,
 * fetchLatestSnapshotEvent found nothing, so the canvas always started blank.
 *
 * Fix (0.2.14): catch `auth-required`, call `relay.auth()` with a 10-second
 * timeout guard (to prevent a stalled NIP-46 signer from blocking the finally
 * block), then retry `relay.publish`.
 *
 * ─── Why relay-errors.ts instead of importing from crdt/provider.ts ──────────
 *
 * 0.2.12 added `import { isAuthRequired } from '../crdt/provider.js'` inside
 * persistence/DocumentPersistence.ts. That cross-module import introduced a
 * new dependency edge (persistence/ ← crdt/) which caused a production
 * regression (attributed to module evaluation order / bundle chunking). The
 * function is duplicated in persistence/relay-errors.ts, which imports nothing
 * from within the package.
 */

// ── Bug 1: finally-block timing ─────────────────────────────────────────────

describe('finally-block timing (JavaScript semantics)', () => {
  /**
   * This test demonstrates the exact race that caused every document load to
   * return null. It is a pure JavaScript semantics test — no relay or mocking
   * needed — because the bug is in how `return new Promise()` interacts with
   * `finally`, not in the relay protocol itself.
   */
  it('return new Promise runs finally BEFORE the promise settles — the bug', async () => {
    const order: string[] = [];

    async function withReturnRace() {
      try {
        return new Promise<void>((resolve) => {
          // Simulate EOSE arriving as a macrotask (same as a real relay message).
          setTimeout(() => {
            order.push('eose');
            resolve();
          }, 0);
        });
      } finally {
        // relay.close() would go here — and it runs BEFORE eose in the buggy form.
        order.push('close');
      }
    }

    await withReturnRace();
    // 'close' fired before 'eose': relay was closed before EOSE arrived.
    // This is exactly what emptied openSubs and silenced the resolve() call.
    expect(order).toEqual(['close', 'eose']);
  });

  it('await new Promise defers finally until after the promise settles — the fix', async () => {
    const order: string[] = [];

    async function withAwaitFix() {
      try {
        const result = await new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push('eose');
            resolve();
          }, 0);
        });
        return result;
      } finally {
        // relay.close() here: guaranteed to run AFTER eose resolved the Promise.
        order.push('close');
      }
    }

    await withAwaitFix();
    // 'eose' fires before 'close': EOSE received, Promise resolved, then relay closed.
    expect(order).toEqual(['eose', 'close']);
  });
});

// ── Bug 2: auth-required detection (relay-errors.ts, no cross-module import) ─

describe('isAuthRequired (persistence/relay-errors — no crdt/ import)', () => {
  it('detects the verbatim rejection emitted by relay.cloistr.xyz', () => {
    // Exact string observed 2026-08-02 when whiteboard tried to save.
    expect(
      isAuthRequired(new Error('auth-required: authentication required to publish events'))
    ).toBe(true);
  });

  it('accepts a bare string reason (OK frame)', () => {
    expect(isAuthRequired('auth-required: please authenticate')).toBe(true);
  });

  it('accepts an object with a reason field (relay OK frame shape)', () => {
    expect(isAuthRequired({ reason: 'auth-required: please authenticate' })).toBe(true);
  });

  it('matches on the machine-readable prefix, not the prose (NIP-01 contract)', () => {
    expect(isAuthRequired(new Error('auth-required: anything at all'))).toBe(true);
  });

  it('tolerates leading whitespace and case variation', () => {
    expect(isAuthRequired(new Error('  AUTH-REQUIRED: nope'))).toBe(true);
  });

  it('does not fire on messages that merely mention authentication', () => {
    // Would trigger an auth-retry loop on unrelated failures if it did.
    expect(isAuthRequired(new Error('authentication required to publish events'))).toBe(false);
    expect(isAuthRequired(new Error('restricted: not an auth challenge'))).toBe(false);
    expect(isAuthRequired(new Error('blocked: pubkey not allowed'))).toBe(false);
  });

  it('does not fire on non-error values', () => {
    expect(isAuthRequired(undefined)).toBe(false);
    expect(isAuthRequired(null)).toBe(false);
    expect(isAuthRequired({})).toBe(false);
    expect(isAuthRequired(42)).toBe(false);
  });

  it('is disjoint from PoW rejections — the two retry paths must not overlap', () => {
    const authErr = new Error('auth-required: authentication required to publish events');
    const powErr = new Error('pow: low trust requires proof of work (got 0, need 8)');
    expect(isAuthRequired(authErr)).toBe(true);
    expect(isAuthRequired(powErr)).toBe(false);
  });
});
