import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Regression test for the PoW nonce-tag commitment bug.
 *
 * computePoW searches for a nonce by hashing the event with the tag
 * ['nonce', n, TARGET]. If the event that is finally signed carries
 * ['nonce', n, ACHIEVED] instead, the tag differs, so the serialization
 * differs, so the event ID differs -- and the relay measures the difficulty of
 * an event that was never mined.
 *
 * Observed live before the fix: the client logged "PoW found: nonce=139,
 * difficulty=9" and the relay rejected that very event with "pow: low trust
 * requires proof of work (got 1, need 8)". Every collaborative publish failed.
 *
 * These tests pin the invariant rather than the implementation: the id you mine
 * must be the id you send.
 */

const PUBKEY = 'cbba4bcfd576a4fb6245922b5baa47ebe856c9e74f6f500ab1789f6dd5145c31';

function eventId(pubkey: string, created_at: number, kind: number, tags: string[][], content: string): string {
  return bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify([0, pubkey, created_at, kind, tags, content])))
  );
}

function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (v === 0) { bits += 4; continue; }
    bits += Math.clz32(v) - 28;
    break;
  }
  return bits;
}

/** Mine exactly the way computePoW does: commit to the TARGET in the tag. */
function mine(kind: number, content: string, baseTags: string[][], target: number, created_at: number) {
  for (let nonce = 0; nonce < 500000; nonce++) {
    const tags = [...baseTags, ['nonce', String(nonce), String(target)]];
    const id = eventId(PUBKEY, created_at, kind, tags, content);
    if (leadingZeroBits(id) >= target) return { nonce, tags, id, achieved: leadingZeroBits(id) };
  }
  throw new Error('no nonce found');
}

describe('PoW nonce tag commitment', () => {
  const kind = 30078;
  const content = 'y-update';
  const created_at = 1785793400;
  const target = 8;

  it('the mined id is what the relay sees when the target is committed', () => {
    const mined = mine(kind, content, [['d', 'doc-1']], target, created_at);
    const sentId = eventId(PUBKEY, created_at, kind, mined.tags, content);
    expect(sentId).toBe(mined.id);
    expect(leadingZeroBits(sentId)).toBeGreaterThanOrEqual(target);
  });

  it('committing the ACHIEVED difficulty instead breaks the id (the bug)', () => {
    const mined = mine(kind, content, [['d', 'doc-1']], target, created_at);
    // Only reproduce the bug when achieved != target; if they are equal the two
    // tags are identical and there is nothing to diverge.
    if (mined.achieved === target) return;

    const buggyTags = [...[['d', 'doc-1']], ['nonce', String(mined.nonce), String(mined.achieved)]];
    const buggyId = eventId(PUBKEY, created_at, kind, buggyTags, content);

    expect(buggyId).not.toBe(mined.id);
    // The whole point: the relay's measurement of the sent event is unrelated to
    // the work performed, so it lands below target far more often than not.
    expect(leadingZeroBits(buggyId)).toBeLessThan(target);
  });

  it('any change to the nonce tag changes the id', () => {
    const base = [['d', 'doc-1']];
    const a = eventId(PUBKEY, created_at, kind, [...base, ['nonce', '139', '8']], content);
    const b = eventId(PUBKEY, created_at, kind, [...base, ['nonce', '139', '9']], content);
    expect(a).not.toBe(b);
  });
});
