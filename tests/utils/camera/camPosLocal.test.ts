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
 * All three cases use hand-derived geometry, never the implementation's own
 * math: the first pins the offset + identity pass-through, the second pins the
 * radius normalisation, the third pins the transpose by rotating a +x offset
 * through a 90° frame.
 */

import { describe, expect, it } from 'vitest';

import type { Mat3 } from '../../../src/@types/math/Mat3';
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
});
