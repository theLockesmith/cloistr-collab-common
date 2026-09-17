/**
 * Strictly increasing timestamps per address, so the relay never has to
 * tie-break two versions of the same event by event id.
 *
 * Measured against relay.cloistr.xyz 2026-09-15: two addressable events with
 * an equal `created_at` are both answered `OK true`, and the relay keeps the
 * one with the lower event id. The newer text is silently discarded after
 * being reported as published.
 *
 * Per address rather than global, because the relay only compares events that
 * share a kind, an author, and a `d` tag. A global counter would drift every
 * unrelated event's timestamp away from when it was actually written.
 *
 * TESTING TRAP FOR ANYONE PROVING A REPLACEABLE-EVENT FIX. A read-back test
 * that publishes two versions in the same second, then queries the relay for
 * the latest, PASSES HALF THE TIME WITH THE BUG PRESENT. The relay keeps the
 * event with the lower id, and ids are hashes, so which version survives is a
 * coin flip. One green run does not prove the fix works; it proves the hash
 * landed favourably.
 *
 * The reliable primary assertion is on the wire: two events for one address
 * carrying the same `created_at` is the bug, regardless of which one the
 * relay keeps. A read-back is fine as a secondary check, never the primary
 * one. Pages' live proof script documents this in place so it is not deleted
 * as redundant. Any app porting this fix should do the same.
 */

const lastCreatedAt = new Map<string, number>();

/**
 * A `created_at` that is strictly greater than the last one used for this
 * address. Normally just the wall clock. It only diverges when two publishes
 * of the SAME address land in one second.
 *
 * `addressKey` is the caller's encoding of the NIP-01 address: typically
 * `${kind}:${pubkey}:${dTag}`.
 */
export function nextCreatedAt(addressKey: string): number {
  const now = Math.floor(Date.now() / 1000);
  const last = lastCreatedAt.get(addressKey);
  const next = last !== undefined && last >= now ? last + 1 : now;
  lastCreatedAt.set(addressKey, next);
  return next;
}

/** Visible to tests only. */
export function _resetCreatedAtState(): void {
  lastCreatedAt.clear();
}
