/**
 * surfaceZoomStep — the wheel notch's anchor (F2, spec §8.1/§12). A peak
 * fixture proves the notch scales about the resident terrain, not the flat
 * datum a `pickOnBody` regression would silently fall back to. The range to
 * the anchor is what a settle's north-up rotation preserves exactly (it
 * pivots ON the anchor axis), so it is what identifies which anchor was used.
 */

import { describe, it, expect } from 'vitest';

import { surfaceZoomStep } from '../../../src/utils/camera/surfaceZoomStep';
import { bodyFixedEyeM } from '../../../src/utils/camera/bodyFixedEyeM';
import { DEFAULT_CAMERA_TUNING } from '../../../src/data/camera/cameraTuning';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { GroundRadiusLookup } from '../../../src/@types/camera/GroundRadiusLookup';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const DATUM_M = 6_371_000;
const PEAK_HEIGHT_M = 8000;
const INNER_RADIUS_M = DATUM_M - 500;
const OUTER_RADIUS_M = DATUM_M + 9000;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2;
const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];

/** A peak directly under the eye's nadir; flat datum everywhere else. */
const peakField: GroundRadiusLookup = (p) => {
  const angleRad = Math.atan2(p[0], p[2]);
  return Math.abs(angleRad) < (2 * Math.PI) / 180 ? DATUM_M + PEAK_HEIGHT_M : DATUM_M;
};

describe('surfaceZoomStep', () => {
  it('anchors the wheel on the peak, not on the flat datum below it', () => {
    const arm: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, DATUM_M + 100_000],
      basisLocal: NADIR,
    };
    const eye = bodyFixedEyeM(arm);
    // The screen-centre ray is exactly nadir, so its analytic hit on the peak
    // is exact: p(t) sits at angle 0 for the whole ray.
    const anchorPeak: Vec3 = [0, 0, DATUM_M + PEAK_HEIGHT_M];
    const anchorDatum: Vec3 = [0, 0, DATUM_M];
    const factor = 0.9;

    const stepped = surfaceZoomStep(
      arm,
      null,
      factor,
      [50, 50],
      VIEWPORT,
      FOV,
      DATUM_M,
      SURFACE_STANDOFF_RADII,
      peakField,
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      [0, 0, 1],
      0,
      DEFAULT_CAMERA_TUNING,
      null,
    );
    const newEye = bodyFixedEyeM(stepped);
    const rangeTo = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
      Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

    // Loosened to metres (not the bit): the anchor marches over terrain to a
    // pixel-sized tolerance rather than an exact analytic root (F2).
    expect(rangeTo(anchorPeak, newEye)).toBeCloseTo(factor * rangeTo(anchorPeak, eye), -1);
    // A `pickOnBody`-against-the-datum regression would satisfy this law
    // instead — off by the full 8 km peak height, nowhere near this margin.
    expect(rangeTo(anchorDatum, newEye)).not.toBeCloseTo(factor * rangeTo(anchorDatum, eye), -1);
  });
});
