import { describe, it, expect } from 'vitest';
import { formatLookback } from '../../../src/utils/format/formatLookback';

describe('formatLookback', () => {
  it('uses Gyr at and above 1 Gyr', () => {
    expect(formatLookback(13.7)).toBe('13.7 Gyr');
    expect(formatLookback(1.27)).toBe('1.27 Gyr');
    expect(formatLookback(1)).toBe('1.00 Gyr');
  });

  it('switches to Myr below 1 Gyr, down to 1 Myr', () => {
    expect(formatLookback(0.045)).toBe('45.0 Myr');
    expect(formatLookback(0.00251)).toBe('2.51 Myr');
    expect(formatLookback(0.001)).toBe('1.00 Myr');
  });

  it('spells out whole years below 1 Myr (Local-Group range)', () => {
    expect(formatLookback(0.000163)).toBe('163,000 years');
    expect(formatLookback(0)).toBe('0 years');
  });
});
