import { describe, expect, it } from 'vitest';
import { parseDatetimeLocalUtc } from '../../../src/utils/time/parseDatetimeLocalUtc';
import { toDatetimeLocalUtc } from '../../../src/utils/time/toDatetimeLocalUtc';

describe('parseDatetimeLocalUtc', () => {
  it('reads the digits as UTC, whatever the host zone', () => {
    // 19 797 days after 1970-01-01, plus 18.5 hours.
    expect(parseDatetimeLocalUtc('2024-03-15T18:30')?.getTime()).toBe(1_710_527_400_000);
  });

  it('returns null for a blank or partial value', () => {
    expect(parseDatetimeLocalUtc('')).toBeNull();
    expect(parseDatetimeLocalUtc('2024-03-15')).toBeNull();
  });

  it('round-trips with toDatetimeLocalUtc, a year below 1000 included', () => {
    for (const value of ['2024-03-15T18:30', '0800-01-02T03:04']) {
      expect(toDatetimeLocalUtc(parseDatetimeLocalUtc(value)!)).toBe(value);
    }
  });
});
