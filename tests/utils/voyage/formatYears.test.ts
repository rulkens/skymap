import { describe, expect, it } from 'vitest';

import { formatYears } from '../../../src/utils/voyage/formatYears';

describe('formatYears', () => {
  it('writes years and days below a thousand years, three figures past it', () => {
    expect(formatYears(0)).toBe('0 yr 0 d');
    expect(formatYears(14.3)).toBe('14 yr 109 d');
    expect(formatYears(5.47e7)).toBe('54,700,000 yr');
  });
});
