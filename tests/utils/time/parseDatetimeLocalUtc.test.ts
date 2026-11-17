import { describe, expect, it } from 'vitest';
import { parseDatetimeLocalUtc } from '../../../src/utils/time/parseDatetimeLocalUtc';
import { toDatetimeLocalUtc } from '../../../src/utils/time/toDatetimeLocalUtc';

describe('parseDatetimeLocalUtc', () => {
  it('round-trips with toDatetimeLocalUtc, a year below 1000 included', () => {
    for (const value of ['2024-03-15T18:30', '0800-01-02T03:04']) {
      expect(toDatetimeLocalUtc(parseDatetimeLocalUtc(value)!)).toBe(value);
    }
  });
});
