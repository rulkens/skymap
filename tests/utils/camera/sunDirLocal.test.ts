/**
 * sunDirLocal — sun-relative light direction, rotated into a body's local frame.
 *
 * The Sun sits at the render origin, so the world-space light direction at a
 * body is `normalize(renderOrigin − bodyPos)` — it points from the body back
 * toward the origin. The body's baked `orientation` is a local→world rotation,
 * so its transpose (the orthonormal inverse) carries that world direction into
 * the body's local frame, where the shader can Lambert-shade with a plain dot.
 *
 * Both cases use hand-derived geometry (not the implementation's own math):
 * the first pins the world direction and the identity pass-through; the second
 * pins the transpose by rotating that direction through a 90° frame.
 */

import { describe, expect, it } from 'vitest';

import type { Mat3 } from '../../../src/@types/math/Mat3';
import { sunDirLocal } from '../../../src/utils/camera/sunDirLocal';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';

describe('sunDirLocal', () => {
  it('of a body on +x with identity orientation points −x', () => {
    // Body at world +x, Sun at the origin. The direction toward the Sun is −x;
    // the identity orientation leaves it unrotated, so local ≈ (−1, 0, 0).
    const local = sunDirLocal([1, 0, 0], [0, 0, 0], IDENTITY_MAT3 as Mat3);

    expect(local[0]).toBeCloseTo(-1, 12);
    expect(local[1]).toBeCloseTo(0, 12);
    expect(local[2]).toBeCloseTo(0, 12);
  });

  it('rotates by a 90° orientation', () => {
    // Same body on +x, Sun at the origin → world sun direction (−1, 0, 0).
    //
    // Orientation R = 90° rotation about +z (column-major, cell row r col c at
    // m[c*3+r]). Its columns are the body-local axes expressed in world space:
    //   local +x → world (0, −1, 0)
    //   local +y → world (1,  0, 0)
    //   local +z → world (0,  0, 1)
    const orientation: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1];

    // Rotating the world sun direction into the local frame uses Rᵀ:
    //   Rᵀ · (−1, 0, 0) = (0, −1, 0)
    // i.e. −x world becomes −y local.
    const local = sunDirLocal([1, 0, 0], [0, 0, 0], orientation);

    expect(local[0]).toBeCloseTo(0, 12);
    expect(local[1]).toBeCloseTo(-1, 12);
    expect(local[2]).toBeCloseTo(0, 12);
  });
});
