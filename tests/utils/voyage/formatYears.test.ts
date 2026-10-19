import { describe, expect, it } from 'vitest';

import { formatYears } from '../../../src/utils/voyage/formatYears';

describe('formatYears', () => {
  it('formatYears never produces NaN or Infinity', () => {
    for (const yr of [0, 0.5, 3.54, 2.54e6, 5.47e7]) {
      expect(formatYears(yr)).not.toMatch(/NaN|Infinity/);
    }
  });

  it('writes years and days below a thousand years, three figures past it', () => {
    expect(formatYears(0)).toBe('0 yr 0 d');
    expect(formatYears(14.3)).toBe('14 yr 109 d');
    expect(formatYears(5.47e7)).toBe('54,700,000 yr');
  });
});
