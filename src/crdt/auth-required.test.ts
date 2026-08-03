import { describe, it, expect } from 'vitest';
import { isAuthRequired, parsePoWRequirement } from './provider.js';

describe('isAuthRequired', () => {
  it('detects the verbatim rejection Cloistr\'s relay sends', () => {
    // Exactly the string observed 2026-08-02 when whiteboard tried to save.
    expect(
      isAuthRequired(new Error('auth-required: authentication required to publish events'))
    ).toBe(true);
  });

  it('accepts a bare string and an OK-frame reason field', () => {
    expect(isAuthRequired('auth-required: we need auth')).toBe(true);
    expect(isAuthRequired({ reason: 'auth-required: we need auth' })).toBe(true);
  });

  it('matches on the machine-readable prefix, not the prose', () => {
    // NIP-01 fixes the prefix; the text after it is relay-specific.
    expect(isAuthRequired(new Error('auth-required: anything at all'))).toBe(true);
  });

  it('tolerates leading whitespace and case', () => {
    expect(isAuthRequired(new Error('  AUTH-REQUIRED: nope'))).toBe(true);
  });

  it('does not fire on prose that merely mentions authentication', () => {
    // Would otherwise re-auth in a loop on unrelated failures.
    expect(isAuthRequired(new Error('authentication required to publish events'))).toBe(false);
    expect(isAuthRequired(new Error('restricted: not an auth challenge'))).toBe(false);
    expect(isAuthRequired(new Error('blocked: pubkey not allowed'))).toBe(false);
  });

  it('does not fire on non-error values', () => {
    expect(isAuthRequired(undefined)).toBe(false);
    expect(isAuthRequired(null)).toBe(false);
    expect(isAuthRequired({})).toBe(false);
  });

  it('is disjoint from the PoW gate', () => {
    // The two rejections are handled by separate retry paths; a message must
    // never satisfy both, or the wrong remedy gets applied.
    const auth = new Error('auth-required: authentication required to publish events');
    const pow = new Error('pow: low trust requires proof of work (got 0, need 8)');
    expect(isAuthRequired(auth)).toBe(true);
    expect(parsePoWRequirement(auth)).toBeNull();
    expect(isAuthRequired(pow)).toBe(false);
    expect(parsePoWRequirement(pow)).toBe(8);
  });
});
