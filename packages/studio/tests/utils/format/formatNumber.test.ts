import { describe, it, expect } from 'vitest';

import { formatNumber } from '../../../src/utils/format/formatNumber';

describe('formatNumber', () => {
  it('keeps one decimal only below 10 and drops a trailing .0', () => {
    expect(formatNumber(5.24)).toBe('5.2');
    expect(formatNumber(4)).toBe('4');
    expect(formatNumber(11.6)).toBe('12');
  });
  it('uses a true minus and never prints a negative zero', () => {
    expect(formatNumber(-3)).toBe('−3');
    expect(formatNumber(-0.04)).toBe('0');
  });
});
