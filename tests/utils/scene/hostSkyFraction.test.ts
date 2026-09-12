/**
 * hostSkyFraction — the 400 km case is the one that ships (whale and petunias),
 * and it is what a reintroduced Earth-shaped constant would fail: 0.331, not
 * the 0.4 the pass carried before the geometry was computed.
 */

import { describe, expect, it } from 'vitest';

import { hostSkyFraction } from '../../../src/utils/scene/hostSkyFraction';

const EARTH_RADIUS_M = 6_371_000;

describe('hostSkyFraction', () => {
  it('fills ~0.331 of the sky from a 400 km Earth orbit', () => {
    expect(hostSkyFraction(EARTH_RADIUS_M, EARTH_RADIUS_M + 400_000)).toBeCloseTo(0.3307, 4);
  });
});
