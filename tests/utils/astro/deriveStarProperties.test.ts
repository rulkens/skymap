import { describe, expect, it } from 'vitest';

import { deriveStarProperties } from '../../../src/utils/astro/deriveStarProperties';

// The card-facing composition. Ground-truth numbers are computed independently
// from the pinned formulas; the extrapolated flag is asserted at both colour
// edges (in-range vs. clamped) because that flag is what the card renders as a
// leading "~".
describe('deriveStarProperties', () => {
  it('flags an out-of-range blue dwarf colour as extrapolated', () => {
    // C = 0.2 is bluer than the dwarf relation's 0.39 hot edge.
    const p = deriveStarProperties(6.0, 0.2);
    expect(p.giant).toBe(false);
    expect(p.extrapolated).toBe(true);
  });

  it('flags an out-of-range red giant colour as extrapolated', () => {
    // C = 1.95 is redder than the giant relation's 1.81 cool edge.
    const p = deriveStarProperties(0.5, 1.95);
    expect(p.giant).toBe(true);
    expect(p.extrapolated).toBe(true);
  });
});
