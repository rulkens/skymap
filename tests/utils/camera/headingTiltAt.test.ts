/**
 * headingTiltAt — the extracted ENU/heading/tilt math `surfaceController`'s
 * tilt-ceiling enforcement consumes. Every fixture
 * here sits OFF the polar axis with a non-zero heading, deliberately: a
 * standpoint on +Z degenerates `east`/`north` to their pole-fallback values
 * and heading to a coordinate that's invariant under a heading-zeroing bug,
 * which is exactly how this math shipped untested once already.
 */

import { describe, it, expect } from 'vitest';

import { headingTiltAt } from '../../../src/utils/camera/headingTiltAt';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** heading/tilt → forward/up at `localUp`, the inverse of what's under test. */
function forwardUpAt(
  localUp: Vec3,
  east: Vec3,
  north: Vec3,
  headingRad: number,
  tiltRad: number,
): { forward: Vec3; up: Vec3 } {
  const ch = Math.cos(headingRad);
  const sh = Math.sin(headingRad);
  const ct = Math.cos(tiltRad);
  const st = Math.sin(tiltRad);
  const horiz: Vec3 = [
    north[0] * ch + east[0] * sh,
    north[1] * ch + east[1] * sh,
    north[2] * ch + east[2] * sh,
  ];
  return {
    forward: [
      horiz[0] * st - localUp[0] * ct,
      horiz[1] * st - localUp[1] * ct,
      horiz[2] * st - localUp[2] * ct,
    ],
    up: [
      horiz[0] * ct + localUp[0] * st,
      horiz[1] * ct + localUp[1] * st,
      horiz[2] * ct + localUp[2] * st,
    ],
  };
}

describe('headingTiltAt', () => {
  it('recovers heading and tilt at an off-pole standpoint (C1/I1)', () => {
    // localUp 45° off the pole, in the XZ plane, so east/north are NOT the
    // near-pole fallback: east = normalize(POLAR_AXIS × localUp) = [0,1,0],
    // north = localUp × east = [-sin45°, 0, sin45°].
    const s = Math.SQRT1_2;
    const localUp: Vec3 = [s, 0, s];
    const east: Vec3 = [0, 1, 0];
    const north: Vec3 = [-s, 0, s];
    const headingRad = (40 * Math.PI) / 180;
    const tiltRad = (25 * Math.PI) / 180;

    const { forward, up } = forwardUpAt(localUp, east, north, headingRad, tiltRad);
    const result = headingTiltAt(localUp, forward, up);

    expect(result.headingRad).toBeCloseTo(headingRad, 12);
    expect(result.tiltRad).toBeCloseTo(tiltRad, 12);
    expect(result.east[0]).toBeCloseTo(east[0], 12);
    expect(result.east[1]).toBeCloseTo(east[1], 12);
    expect(result.east[2]).toBeCloseTo(east[2], 12);
    expect(result.north[0]).toBeCloseTo(north[0], 12);
    expect(result.north[1]).toBeCloseTo(north[1], 12);
    expect(result.north[2]).toBeCloseTo(north[2], 12);
  });

  it('reads heading off `up` near nadir, where forward carries no azimuth', () => {
    const s = Math.SQRT1_2;
    const localUp: Vec3 = [s, 0, s];
    const east: Vec3 = [0, 1, 0];
    const north: Vec3 = [-s, 0, s];
    const headingRad = (110 * Math.PI) / 180;
    const tiltRad = 0; // straight down: forward = -localUp, azimuth-blind

    const { forward, up } = forwardUpAt(localUp, east, north, headingRad, tiltRad);
    const result = headingTiltAt(localUp, forward, up);

    expect(result.headingRad).toBeCloseTo(headingRad, 12);
    expect(result.tiltRad).toBeCloseTo(0, 12);
  });
});
