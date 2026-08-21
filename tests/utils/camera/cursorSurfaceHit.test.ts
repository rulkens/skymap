/**
 * cursorSurfaceHit — ray↔sphere hit, converted to the body's local lon/lat.
 *
 * The nadir case pins the hit-point + identity-frame conversion against
 * `directionToLonLatDeg`'s own documented convention (latDeg = asin(z)). The
 * rotated-orientation case reuses the exact same ray, so a missing or
 * un-transposed rotation is the ONLY thing that can make it disagree with the
 * identity case — that is the regression this test exists to catch.
 */

import { describe, it, expect } from 'vitest';
import { cursorSurfaceHit } from '../../../src/utils/camera/cursorSurfaceHit';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

describe('cursorSurfaceHit', () => {
  const NADIR_RAY = {
    origin: [0, 0, 3] as Vec3,
    direction: [0, 0, -1] as Vec3,
  };

  it('returns the nadir point for a ray aimed straight at the body centre', () => {
    // Hit point [0,0,1]: directionToLonLatDeg → lonDeg = atan2(0,0) = 0,
    // latDeg = asin(1) = 90.
    const point = cursorSurfaceHit(NADIR_RAY, [0, 0, 0], 1, IDENTITY_MAT3 as Mat3);

    expect(point).not.toBeNull();
    expect(point!.lonDeg).toBeCloseTo(0, 10);
    expect(point!.latDeg).toBeCloseTo(90, 10);
  });

  it('returns null for a ray that misses the sphere', () => {
    // Perpendicular offset 2 > radius 1 — never crosses the sphere.
    const ray = { origin: [0, 2, 3] as Vec3, direction: [0, 0, -1] as Vec3 };

    expect(cursorSurfaceHit(ray, [0, 0, 0], 1, IDENTITY_MAT3 as Mat3)).toBeNull();
  });

  it('respects bodyOrientation — reflects the rotated local frame, not world axes', () => {
    // Rotation columns (local axis i expressed in world), column-major:
    //   local +x → world (0, 0, -1)
    //   local +y → world (0, 1,  0)
    //   local +z → world (1, 0,  0)
    // i.e. the body's local +z pole is rotated to point along world +x.
    const orientation: Mat3 = [0, 0, -1, 0, 1, 0, 1, 0, 0];

    const point = cursorSurfaceHit(NADIR_RAY, [0, 0, 0], 1, orientation);

    expect(point).not.toBeNull();
    // World hit offset [0,0,1] rotated by Rᵀ: local = (dot with col0, col1,
    // col2) = (-1, 0, 0) — NOT the identity case's (lon 0, lat 90). A missing
    // or un-transposed rotation would still report lat 90 here.
    expect(point!.latDeg).toBeCloseTo(0, 10);
    expect(Math.abs(point!.lonDeg)).toBeCloseTo(180, 10);
  });
});
