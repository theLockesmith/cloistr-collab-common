import { describe, it, expect } from 'vitest';
import { parsePoWRequirement } from './provider.js';

describe('parsePoWRequirement', () => {
  it('parses the required bits from the WoT rejection (Error)', () => {
    // The relay's per-trust-level gate, after the trust.go change.
    expect(
      parsePoWRequirement(new Error('pow: low trust requires proof of work (got 0, need 8)'))
    ).toBe(8);
  });

  it('parses the required bits from the global gate format', () => {
    expect(
      parsePoWRequirement(new Error('pow: insufficient proof of work (got 3, need 21)'))
    ).toBe(21);
  });

  it('accepts a bare string reason', () => {
    expect(parsePoWRequirement('pow: insufficient proof of work (got 0, need 12)')).toBe(12);
  });

  it('accepts a relay OK frame with a reason field', () => {
    expect(parsePoWRequirement({ reason: 'pow: proof of work required, need 16' })).toBe(16);
  });

  it('returns null for a PoW rejection that carries no number (older relay)', () => {
    // Must NOT retry blindly: without a target there is nothing to mine to.
    expect(parsePoWRequirement(new Error('pow: low trust requires proof of work'))).toBeNull();
  });

  it('returns null for non-PoW errors so the caller does not retry', () => {
    for (const e of [
      new Error('blocked: rate-limited'),
      new Error('invalid: bad signature'),
      new Error('restricted: not authorized to write'),
      'connection closed',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(parsePoWRequirement(e)).toBeNull();
    }
  });

  it('is case-insensitive and tolerant of surrounding text', () => {
    expect(parsePoWRequirement(new Error('POW: NEED 9 bits of work'))).toBe(9);
  });

  it('does not misfire on the word "power" or similar', () => {
    // "pow:" prefix or "proof of work" phrase is required; unrelated text is ignored.
    expect(parsePoWRequirement(new Error('powering down, need 5 retries'))).toBeNull();
  });
});
