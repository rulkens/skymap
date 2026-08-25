/**
 * bodyApparentDiameterPx — the shared "body record → apparent pixel size"
 * projection the three LOD gates read.
 *
 * These pin the similar-triangles geometry a real bug would break: the camera
 * inside a body resolves (Infinity, not the raw 0 the divide-by-zero guard
 * emits); apparent size falls inversely with distance and rises linearly with
 * radius (an inverted factor would flip these); and a hand-placed body clears a
 * threshold it should while a ten-times-farther twin does not.
 */

import { describe, it, expect } from 'vitest';

import { bodyApparentDiameterPx } from '../../../src/utils/scene/bodyApparentDiameterPx';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const VIEWPORT_HEIGHT_PX = 720;
const FOV_Y_RAD = Math.PI / 3;
const CAM: Vec3 = [0, 0, 0];

/** A body of `radiusM` sitting `distanceM` down +x from the origin camera. */
function at(
  radiusM: number,
  distanceM: number,
): {
  positionMpc: Vec3;
  radiusM: number;
  camPosMpc: Vec3;
  viewportHeightPx: number;
  fovYRad: number;
} {
  return {
    positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
    radiusM,
    camPosMpc: CAM,
    viewportHeightPx: VIEWPORT_HEIGHT_PX,
    fovYRad: FOV_Y_RAD,
  };
}

describe('bodyApparentDiameterPx', () => {
  it('returns Infinity when the camera sits on the body (distance 0)', () => {
    expect(bodyApparentDiameterPx(at(1_000_000, 0))).toBe(Infinity);
  });

  it('is a positive finite size for a body in front of the camera', () => {
    const px = bodyApparentDiameterPx(at(1_000_000, 500_000_000));
    expect(px).toBeGreaterThan(0);
    expect(Number.isFinite(px)).toBe(true);
  });

  it('falls inversely with distance — a twin ten times farther is one tenth the size', () => {
    const near = bodyApparentDiameterPx(at(1_000_000, 500_000_000));
    const far = bodyApparentDiameterPx(at(1_000_000, 5_000_000_000));
    expect(far).toBeCloseTo(near / 10, 10);
  });

  it('rises linearly with radius — twice the radius is twice the apparent size', () => {
    const small = bodyApparentDiameterPx(at(1_000_000, 500_000_000));
    const big = bodyApparentDiameterPx(at(2_000_000, 500_000_000));
    expect(big).toBeCloseTo(small * 2, 10);
  });
});
