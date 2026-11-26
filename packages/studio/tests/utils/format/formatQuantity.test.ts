import { describe, it, expect } from 'vitest';

import { formatQuantity } from '../../../src/utils/format/formatQuantity';

describe('formatQuantity', () => {
  it('spaces units, keeps degrees tight, and uses a true minus', () => {
    expect(formatQuantity(300, 'Mpc')).toBe('300 Mpc');
    expect(formatQuantity(5.2, '°')).toBe('5.2°');
    expect(formatQuantity(-20, '°')).toBe('−20°');
    expect(formatQuantity(1.4, '°/s')).toBe('1.4°/s');
    expect(formatQuantity(0, '%')).toBe('0 %');
  });
  it('never prints a negative zero', () => {
    expect(formatQuantity(-0.0, '°')).toBe('0°');
    expect(formatQuantity(-0.04, '°')).toBe('0°');
  });
});
