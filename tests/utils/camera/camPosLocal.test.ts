/**
 * camPosLocal — camera position expressed in a body's unit-sphere local frame.
 *
 * The PBR fragment forms a view vector `V = normalize(camPosLocal −
 * surfacePosLocal)`, so — unlike `sunDirLocal`, which throws away magnitude —
 * this util must PRESERVE distance: subtract the body centre, rotate the world
 * offset into the local frame with the orientation's transpose, then divide by
 * `radiusMpc` so the result is measured in body radii (the same units as the
 * interpolated `normalLocal` surface positions).
 *
 * `oblateness` extends that: the polar axis divides by the SHORTENED radius
 * `radiusMpc·(1 − oblateness)`, because that is the axis scale `composeBodyMvp`
 * put in `S`. The flatten applies to the body's OWN pole, so it must land after
 * the transpose — flattening the world-z component instead is the bug the
 * rotated case discriminates.
 *
 * Every case uses hand-derived geometry, never the implementation's own math:
 * the first pins the offset + identity pass-through, the second pins the radius
 * normalisation, the third pins the transpose by rotating a +x offset through a
 * 90° frame, and the last three pin the oblate polar divisor.
 */

import { describe, expect, it } from 'vitest';

import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { camPosLocal } from '../../../src/utils/camera/camPosLocal';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';

describe('camPosLocal', () => {
  it('offsets by the body centre and keeps magnitude at unit radius', () => {
    // Body at world +10x, camera at +13x, unit radius. The offset is +3x and
    // identity leaves it unrotated, so the camera sits 3 body-radii along +x.
    const local = camPosLocal([13, 0, 0], [10, 0, 0], 1, IDENTITY_MAT3 as Mat3);

    expect(local[0]).toBeCloseTo(3, 12);
    expect(local[1]).toBeCloseTo(0, 12);
    expect(local[2]).toBeCloseTo(0, 12);
  });

  it('divides the offset by the body radius', () => {
    // Same +3x offset, but a radius-3 body: 3 Mpc is one body-radius, so the
    // camera lands at local (1, 0, 0).
    const local = camPosLocal([13, 0, 0], [10, 0, 0], 3, IDENTITY_MAT3 as Mat3);

    expect(local[0]).toBeCloseTo(1, 12);
    expect(local[1]).toBeCloseTo(0, 12);
    expect(local[2]).toBeCloseTo(0, 12);
  });

  it('rotates the world offset into the local frame with Rᵀ', () => {
    // Body at +10x, camera at +13x → world offset (3, 0, 0).
    //
    // Orientation R = 90° rotation about +z (column-major, cell row r col c at
    // m[c*3+r]). Its columns are the body-local axes expressed in world space:
    //   local +x → world (0, −1, 0)
    //   local +y → world (1,  0, 0)
    //   local +z → world (0,  0, 1)
    const orientation: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1];

    // Carrying the world offset into the local frame uses Rᵀ (row i of Rᵀ =
    // column i of R):
    //   Rᵀ · (3, 0, 0) = (col0·offset, col1·offset, col2·offset)
    //                  = (0, 3, 0)
    // i.e. a +x world offset becomes +y local. Radius 1 leaves the magnitude.
    const local = camPosLocal([13, 0, 0], [10, 0, 0], 1, orientation);

    expect(local[0]).toBeCloseTo(0, 12);
    expect(local[1]).toBeCloseTo(3, 12);
    expect(local[2]).toBeCloseTo(0, 12);
  });

  // ── oblateness: the polar axis divides by the SHORTENED radius ────────────
  //
  // Shared setup for the next three: world offset (3, 4, 6.5), equatorial
  // radius 2. Spherically that is (1.5, 2, 3.25) local. With oblateness 0.35
  // the polar divisor becomes 2 · 0.65 = 1.3, so z = 6.5 / 1.3 = 5 — exactly
  // 1/0.65 times the spherical 3.25.
  const CAM: Vec3 = [13, 14, 16.5];
  const BODY: Vec3 = [10, 10, 10];

  it('leaves the local vector unchanged when oblateness is omitted', () => {
    const local = camPosLocal(CAM, BODY, 2, IDENTITY_MAT3 as Mat3);

    expect(local[0]).toBeCloseTo(1.5, 12);
    expect(local[1]).toBeCloseTo(2, 12);
    expect(local[2]).toBeCloseTo(3.25, 12);
  });

  it('divides the polar component by 1 − oblateness, leaving x and y alone', () => {
    const local = camPosLocal(CAM, BODY, 2, IDENTITY_MAT3 as Mat3, 0.35);

    // Equatorial axes still divide by the equatorial radius 2 …
    expect(local[0]).toBeCloseTo(1.5, 12);
    expect(local[1]).toBeCloseTo(2, 12);
    // … while the pole divides by 1.3, landing 1/0.65 further out.
    expect(local[2]).toBeCloseTo(5, 12);
  });

  it('flattens the body LOCAL pole, not world z', () => {
    // R = 90° about world +x (local→world): local +x → world +x,
    // local +y → world +z, local +z → world −y. Column-major columns:
    //   col0 = (1, 0, 0), col1 = (0, 0, 1), col2 = (0, −1, 0)
    const orientation: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];

    // Rᵀ · (3, 4, 6.5) = (col0·o, col1·o, col2·o) = (3, 6.5, −4).
    // Equatorial x, y divide by 2 → (1.5, 3.25); the LOCAL pole component −4
    // divides by 1.3 → −3.0769…  Flattening world z instead would give
    // y = 5 and z = −2.
    const local = camPosLocal(CAM, BODY, 2, orientation, 0.35);

    expect(local[0]).toBeCloseTo(1.5, 12);
    expect(local[1]).toBeCloseTo(3.25, 12);
    expect(local[2]).toBeCloseTo(-4 / 1.3, 12);
  });
});
