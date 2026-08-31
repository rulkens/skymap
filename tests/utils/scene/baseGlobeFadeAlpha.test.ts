/**
 * baseGlobeFadeAlpha — unit tests for Earth's base-globe descent fade.
 *
 * Mirrors `cloudDeckFade.test.ts`'s shape: full alpha well above the band,
 * zero at and below the lower altitude, and a strictly fractional value at
 * the midpoint — the properties a future edit (wrong edge order, a dropped
 * km conversion) could silently break without any other test catching it.
 */

import { describe, it, expect } from 'vitest';

import { baseGlobeFadeAlpha } from '../../../src/utils/scene/baseGlobeFadeAlpha';
import {
  EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM,
  EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM,
} from '../../../src/data/bodies/earthTileParams';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

// A body radius on Earth's own scale (~6371 km in Mpc), not an arbitrary
// O(1) value: KM_TO_MPC is ~3e-20, so adding a few-hundred-km altitude delta
// to a radius of 1 Mpc rounds away to nothing in a double — the delta must
// be the same order of magnitude as the radius it's added to.
const RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

/** Camera-to-centre distance (Mpc) for a given altitude (km) above a
 *  unit-radius body. */
function distanceAt(altitudeKm: number): number {
  return RADIUS_MPC + altitudeKm * SCALE_UNITS.KM_TO_MPC;
}

describe('baseGlobeFadeAlpha', () => {
  it('is fully visible at and above the full-alpha altitude', () => {
    expect(baseGlobeFadeAlpha(distanceAt(EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM), RADIUS_MPC)).toBe(
      1,
    );
    expect(
      baseGlobeFadeAlpha(distanceAt(EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM * 10), RADIUS_MPC),
    ).toBe(1);
  });

  it('is fully gone at and below the gone altitude', () => {
    expect(baseGlobeFadeAlpha(distanceAt(EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM), RADIUS_MPC)).toBe(
      0,
    );
    expect(
      baseGlobeFadeAlpha(distanceAt(EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM / 2), RADIUS_MPC),
    ).toBe(0);
    expect(baseGlobeFadeAlpha(distanceAt(0), RADIUS_MPC)).toBe(0);
  });

  it('is strictly fractional at the band midpoint', () => {
    const midKm =
      (EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM + EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM) / 2;
    const alpha = baseGlobeFadeAlpha(distanceAt(midKm), RADIUS_MPC);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });
});
