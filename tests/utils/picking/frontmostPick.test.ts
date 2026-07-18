// Grepped `src/utils` for an existing first-non-zero helper before writing
// this one (firstNonZero / first-non-zero) — none found, so `frontmostPick`
// is the first home for this fold.

import { describe, it, expect } from 'vitest';
import { frontmostPick } from '../../../src/utils/picking/frontmostPick';

describe('frontmostPick', () => {
  it('returns 0 for all-zero readbacks', () => {
    // No slab reported a hit → the pick misses. Empty is the same miss.
    expect(frontmostPick([0, 0])).toBe(0);
    expect(frontmostPick([])).toBe(0);
  });

  it('returns the single slab´s hit', () => {
    expect(frontmostPick([0, 7])).toBe(7);
  });

  it('near slab occludes far', () => {
    // Both slabs hit; index 0 is nearest, and near content visually
    // occludes far, so its raw value wins.
    expect(frontmostPick([5, 9])).toBe(5);
  });

  it('falls through to a far-only hit', () => {
    expect(frontmostPick([0, 9])).toBe(9);
  });
});
