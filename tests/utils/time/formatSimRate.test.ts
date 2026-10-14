import { describe, it, expect } from 'vitest';

import { formatSimRate } from '../../../src/utils/time/formatSimRate';

describe('formatSimRate', () => {
  it('picks the unit by magnitude', () => {
    expect(formatSimRate(240)).toBe('4 min/s');
    expect(formatSimRate(4320)).toBe('1.2 h/s');
    expect(formatSimRate(30)).toBe('30 s/s');
    expect(formatSimRate(86_400 * 2.5)).toBe('2.5 day/s');
    expect(formatSimRate(86_400 * 365.25 * 1.4)).toBe('1.4 yr/s');
  });
});
