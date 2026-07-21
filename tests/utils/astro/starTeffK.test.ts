import { describe, expect, it } from 'vitest';

import { starTeffK } from '../../../src/utils/astro/starTeffK';

// Ground-truth kelvin values are computed independently from the pinned
// Mucciarelli+21 coefficients (see the util's docblock) — these assert the
// θ = 5040/T formula is wired up, not the astrophysics.
describe('starTeffK', () => {
  it('reproduces the solar colour for a dwarf (the calibration anchor)', () => {
    // BP−RP 0.82 is the Sun's Gaia colour; the relation reads ~5684 K, ~90 K
    // below the true 5772 — that miss is the relation's real behaviour.
    expect(starTeffK(0.82, 'dwarf')).toBeCloseTo(5683.94, 1);
  });

  it('reads a red-giant colour cooler on the giant branch', () => {
    expect(starTeffK(1.23, 'giant')).toBeCloseTo(4720.95, 1);
  });

  it('clamps a too-blue dwarf colour to the hot validity edge', () => {
    // Anything bluer than C=0.39 yields the boundary temperature.
    expect(starTeffK(0.2, 'dwarf')).toBeCloseTo(starTeffK(0.39, 'dwarf'), 6);
  });

  it('clamps a too-red dwarf colour to the cool validity edge', () => {
    expect(starTeffK(2.0, 'dwarf')).toBeCloseTo(starTeffK(1.5, 'dwarf'), 6);
  });
});
