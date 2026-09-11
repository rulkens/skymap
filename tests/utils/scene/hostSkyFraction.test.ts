/**
 * hostSkyFraction — the three regimes the mesh bodies' host fill rides on.
 * The 400 km case is the one that ships (whale and petunias), and it is what a
 * reintroduced Earth-shaped constant would fail: it is 0.331, not the 0.4 the
 * pass carried before the geometry was computed.
 */

import { describe, expect, it } from 'vitest';

import { hostSkyFraction } from '../../../src/utils/scene/hostSkyFraction';

const EARTH_RADIUS_M = 6_371_000;

describe('hostSkyFraction', () => {
  it('fills half the sky from the host surface', () => {
    expect(hostSkyFraction(EARTH_RADIUS_M, EARTH_RADIUS_M)).toBe(0.5);
  });

  it('fills ~0.331 of the sky from a 400 km Earth orbit', () => {
    expect(hostSkyFraction(EARTH_RADIUS_M, EARTH_RADIUS_M + 400_000)).toBeCloseTo(0.3307, 4);
  });

  it('vanishes at interplanetary range', () => {
    expect(hostSkyFraction(EARTH_RADIUS_M, 1.5e11)).toBeCloseTo(0, 8);
  });
});
