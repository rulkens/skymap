import { describe, it, expect } from 'vitest';
import { formatDistance } from '../../../src/utils/format/formatDistance';

// PC_TO_LY = 3.26156, so 1 Mpc → 3.26156 Mly, 1 kpc → 3.26156 kly, etc.
// Tests assert the string shape (parsec value / lightyear value with
// matching unit decade) rather than the precise rounded number — the
// formatScalar helper's adaptive precision is covered indirectly.

describe('formatDistance', () => {
  it('uses Mpc / Mly in the [1, 1000) range', () => {
    expect(formatDistance(1)).toBe('1.00 Mpc / 3.26 Mly');
    expect(formatDistance(100)).toBe('100 Mpc / 326 Mly');
    expect(formatDistance(542.3)).toBe('542 Mpc / 1,769 Mly');
    expect(formatDistance(999)).toBe('999 Mpc / 3,258 Mly');
  });
  it('switches to kpc / kly below 1 Mpc', () => {
    expect(formatDistance(0.5)).toBe('500 kpc / 1,631 kly');
    expect(formatDistance(0.1)).toBe('100 kpc / 326 kly');
    expect(formatDistance(0.001)).toBe('1.00 kpc / 3.26 kly');
  });
  it('switches to Gpc / Gly at and above 1000 Mpc', () => {
    expect(formatDistance(1000)).toBe('1.00 Gpc / 3.26 Gly');
    expect(formatDistance(2500)).toBe('2.50 Gpc / 8.15 Gly');
  });
});
