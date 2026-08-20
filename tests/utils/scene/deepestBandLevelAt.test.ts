/**
 * deepestBandLevelAt — the coverage-lookup half of the sub-camera readout.
 * What can break here: a point outside a band's box still reporting coverage
 * (an off-by-one on the inclusive/exclusive edge), two overlapping bands
 * losing the DEEPEST one, and the whole-globe base band (the common case)
 * shadowing a real regional deep band instead of being outranked by it.
 */
import { describe, it, expect } from 'vitest';

import { deepestBandLevelAt } from '../../../src/utils/scene/deepestBandLevelAt';
import type { EarthTileBand } from '../../../src/@types/scene/EarthTileBand';

/** uBounds/vBounds built the same way `derivePlannerParams` builds them from
 *  a `LonLatBounds`, so the fixture matches the real manifest shape. */
function band(west: number, east: number, south: number, north: number, max: number): EarthTileBand {
  return {
    uBounds: [(west + 180) / 360, (east + 180) / 360],
    vBounds: [(south + 90) / 180, (north + 90) / 180],
    min: 1,
    max,
  };
}

// Søndermarken's demo band from the bug report: west 12.51, east 12.55,
// south 55.662, north 55.678, baked to z19.
const WHOLE_GLOBE = band(-180, 180, -90, 90, 13);
const SONDERMARKEN = band(12.51, 12.55, 55.662, 55.678, 19);

describe('deepestBandLevelAt', () => {
  it('reports the deepest band covering a point inside the demo patch', () => {
    expect(
      deepestBandLevelAt([WHOLE_GLOBE, SONDERMARKEN], { lonDeg: 12.53, latDeg: 55.67 }),
    ).toBe(19);
  });

  it('falls back to the shallower band just outside the demo patch', () => {
    // A few km away — inside the whole-globe band but outside the deep patch.
    expect(
      deepestBandLevelAt([WHOLE_GLOBE, SONDERMARKEN], { lonDeg: 12.6, latDeg: 55.67 }),
    ).toBe(13);
  });

  it('returns null when no band covers the point', () => {
    expect(deepestBandLevelAt([SONDERMARKEN], { lonDeg: 0, latDeg: 0 })).toBeNull();
  });

  it('picks the deepest of several overlapping bands, not the first or last', () => {
    const shallow = band(10, 15, 50, 60, 11);
    const deep = band(12, 13, 55, 56, 19);
    const mid = band(11, 14, 54, 57, 15);
    const point = { lonDeg: 12.5, latDeg: 55.5 };
    expect(deepestBandLevelAt([shallow, deep, mid], point)).toBe(19);
    expect(deepestBandLevelAt([deep, mid, shallow], point)).toBe(19);
  });

  it('treats a point exactly on a band edge as covered', () => {
    expect(deepestBandLevelAt([SONDERMARKEN], { lonDeg: 12.51, latDeg: 55.67 })).toBe(19);
  });
});
