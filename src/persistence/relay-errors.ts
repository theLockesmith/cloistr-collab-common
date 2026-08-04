/**
 * Relay error helpers for the persistence layer.
 *
 * These helpers are intentionally DUPLICATED here rather than imported from
 * crdt/provider.ts. Importing across module boundaries inside this package
 * (persistence/ ← crdt/) changes the compiled import graph and caused a
 * production regression in 0.2.12. This file imports nothing from within the
 * package — it is a dependency-free leaf.
 *
 * Keep in sync with the identical functions in crdt/provider.ts.
 */

/**
 * Detect a NIP-42 rejection.
 *
 * Per NIP-01, a relay refuses an event it wants authentication for with an OK
 * frame whose reason is machine-readable-prefixed `auth-required:`. Cloistr's
 * relay sends exactly:
 *
 *   auth-required: authentication required to publish events
 *
 * The prefix is checked rather than the prose, which is relay-specific and not
 * contractual.
 */
export function isAuthRequired(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : error && typeof (error as { reason?: unknown }).reason === 'string'
      ? (error as { reason: string }).reason
    : '';
  return /^\s*auth-required:/i.test(msg);
}
