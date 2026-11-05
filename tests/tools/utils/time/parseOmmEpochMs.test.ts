import { describe, expect, it } from 'vitest';
import { parseOmmEpochMs } from '../../../../tools/utils/time/parseOmmEpochMs';

describe('parseOmmEpochMs', () => {
  it('reads the epoch as UTC and keeps the microseconds', () => {
    // 2026-10-27T03:45:44Z is 1_793_072_744_000 ms; the .572896 s must survive whole.
    expect(parseOmmEpochMs('2026-10-27T03:45:44.572896')).toBeCloseTo(1_793_072_744_572.896, 6);
  });

  it('accepts an epoch with no fractional seconds', () => {
    expect(parseOmmEpochMs('2000-01-01T12:00:00')).toBe(946_728_000_000);
  });

  it('rejects anything that is not an OMM epoch', () => {
    expect(() => parseOmmEpochMs('2026-10-27T03:45:44Z')).toThrow(/not an OMM epoch/);
    expect(() => parseOmmEpochMs('')).toThrow(/not an OMM epoch/);
  });
});
