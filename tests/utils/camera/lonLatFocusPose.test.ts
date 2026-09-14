/**
 * lonLatFocusPose — the body-arm constructor, read back the way the engaged
 * camera reads a pose: the eye's own direction for the standpoint
 * (`directionToLonLatDeg`, the inverse of the constructor's forward map) and
 * `eyeFrameOf` for the tilt.
 */
import { describe, it, expect } from 'vitest';

import { lonLatFocusPose } from '../../../src/utils/camera/lonLatFocusPose';
import { bodyFixedEyeM } from '../../../src/utils/camera/bodyFixedEyeM';
import { eyeFrameOf } from '../../../src/utils/camera/eyeFrameOf';
import { directionToLonLatDeg } from '../../../src/utils/scene/directionToLonLatDeg';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { BODY_LOCAL_FRAME } from '../../../src/data/camera/bodyLocalFrame';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { LonLatDeg } from '../../../src/@types/scene/LonLatDeg';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const EARTH = 'earth' as BodyId;
const RADIUS_M = 6_371_000;

const points: LonLatDeg[] = [
  { lonDeg: 12.53, latDeg: 55.67 }, // GeoDanmark demo patch centre
  { lonDeg: 0, latDeg: 0 },
  { lonDeg: 90, latDeg: 0 },
  { lonDeg: -90, latDeg: 0 },
  { lonDeg: 179, latDeg: 10 },
  { lonDeg: -179, latDeg: -10 },
  { lonDeg: 45, latDeg: 80 },
  { lonDeg: -60, latDeg: -70 },
];

function expectBasis(actual: Mat3, expected: readonly number[]) {
  for (let i = 0; i < 9; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, 12);
}

describe('lonLatFocusPose', () => {
  it('puts the given lon/lat under the camera', () => {
    for (const point of points) {
      const pose = lonLatFocusPose(point, EARTH, RADIUS_M, 400_000, 0.7);
      const standpoint = directionToLonLatDeg(normalize3(bodyFixedEyeM(pose)));
      expect(standpoint.lonDeg).toBeCloseTo(point.lonDeg, 9);
      expect(standpoint.latDeg).toBeCloseTo(point.latDeg, 9);
    }
  });

  it('sits at the requested range above the surface, at tilt 0', () => {
    const rangeM = 1_234_567;
    const pose = lonLatFocusPose(points[0]!, EARTH, RADIUS_M, rangeM, 0.7);
    // Straight down, so the sightline range to the surface IS the altitude.
    expect(Math.hypot(...bodyFixedEyeM(pose)) / (RADIUS_M + rangeM)).toBeCloseTo(1, 12);
    expect(eyeFrameOf(pose, 1, BODY_LOCAL_FRAME.pole)!.tiltRad).toBeCloseTo(0, 6);
  });

  it('holds the requested heading against the body ENU', () => {
    // Hand-computed at (0, 0): local up is +x, north +z, east +y. Looking
    // straight down (forward = −up), screen-up is the heading direction in that
    // horizontal plane, and right is 90° clockwise from it.
    const northUp = lonLatFocusPose({ lonDeg: 0, latDeg: 0 }, EARTH, RADIUS_M, 1e5, 0);
    expectBasis(northUp.basisLocal, [0, 1, 0, 0, 0, 1, -1, 0, 0]);

    const eastUp = lonLatFocusPose({ lonDeg: 0, latDeg: 0 }, EARTH, RADIUS_M, 1e5, Math.PI / 2);
    expectBasis(eastUp.basisLocal, [0, 0, -1, 0, 1, 0, -1, 0, 0]);
  });
});
