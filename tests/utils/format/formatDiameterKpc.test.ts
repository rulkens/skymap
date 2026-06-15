import { describe, it, expect } from 'vitest';
import { formatDiameterKpc } from '../../../src/utils/format/formatDiameterKpc';

// PC_TO_LY = 3.26156, so 1 kpc → 3.26156 kly.  Tests assert the string
// shape (kpc value / kly value at the same decade) rather than precise
// rounding — the formatScalar helper's adaptive precision is covered
// indirectly.

describe('formatDiameterKpc', () => {
  it('pairs kpc with kly at the same decade', () => {
    expect(formatDiameterKpc(30)).toBe('30.0 kpc / 97.8 kly');
    expect(formatDiameterKpc(100)).toBe('100 kpc / 326 kly');
  });
  it('handles small dwarf-galaxy diameters', () => {
    expect(formatDiameterKpc(0.5)).toBe('0.5 kpc / 1.63 kly');
  });
});
