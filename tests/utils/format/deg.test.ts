import { describe, it, expect } from 'vitest';
import { deg } from '../../../src/utils/format/deg';

describe('deg', () => {
  it('converts radians to a one-decimal degree readout', () => {
    expect(deg(Math.PI / 6)).toBe('30.0°');
    expect(deg(-Math.PI / 2)).toBe('-90.0°');
  });
  it('em-dashes a null value', () => {
    expect(deg(null)).toBe('—');
  });
});
