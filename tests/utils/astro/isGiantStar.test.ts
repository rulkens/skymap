import { describe, expect, it } from 'vitest';

import { isGiantStar } from '../../../src/utils/astro/isGiantStar';

// The CMD split is a conjunction: bright AND red. Each test flips exactly one
// side of the AND so a failure pins which half of the rule broke — not a
// boundary mirror (the constants 4.0 / 0.9 are never restated as inputs).
describe('isGiantStar', () => {
  it('flags a bright, red red-giant-branch star', () => {
    expect(isGiantStar(0.7, 1.23)).toBe(true);
  });

  it('rejects a bright but blue star (hot, not a giant)', () => {
    expect(isGiantStar(0.7, 0.4)).toBe(false);
  });

  it('rejects a red but faint main-sequence dwarf', () => {
    // A red M dwarf is intrinsically faint — absMag well above the cut.
    expect(isGiantStar(9.0, 1.5)).toBe(false);
  });
});
