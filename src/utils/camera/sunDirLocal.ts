/**
 * sunDirLocal — the Sun's light direction at a body, expressed in the body's
 * own local frame.
 *
 *   body position + render origin + baked orientation  →  local sun direction
 *
 * The Sun sits at the heliocentric render origin, so the world-space direction
 * from a body toward the Sun is simply `normalize(renderOrigin − bodyPos)`.
 *
 * ### Why transpose the orientation
 *
 * A body's baked `orientation` `R` is a *local→world* rotation (the same matrix
 * `composeBodyMvp` embeds as `T·R·S`): its columns are the body-local axes
 * written in world space. To carry a world-space vector *into* the local frame
 * we need the inverse, `R⁻¹`. `R` is orthonormal (a pure rotation), so its
 * inverse is exactly its transpose `Rᵀ` — no general 3×3 inversion required.
 * Concretely, the local component along local axis `i` is the projection of the
 * world direction onto that axis, i.e. its dot with column `i` of `R`.
 *
 * ### Why compute this CPU-side, per body, per frame
 *
 * Doing the transpose-rotate here means the shader receives the light direction
 * already in the same frame as its interpolated surface normals, so lighting
 * stays a plain Lambert dot product — no per-fragment matrix, and it stays
 * correct even when a body carries an axial tilt in `orientation`.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function sunDirLocal(
  bodyPosMpc: Readonly<Vec3>,
  renderOriginMpc: Readonly<Vec3>,
  orientation: Readonly<Mat3>,
): Vec3 {
  // World-space direction from the body toward the Sun (the render origin).
  let wx = renderOriginMpc[0] - bodyPosMpc[0];
  let wy = renderOriginMpc[1] - bodyPosMpc[1];
  let wz = renderOriginMpc[2] - bodyPosMpc[2];
  const len = Math.hypot(wx, wy, wz);
  if (len > 0) {
    wx /= len;
    wy /= len;
    wz /= len;
  }

  // Rᵀ · w: local component along local axis i = dot(w, column i of R).
  // Column-major (cell row r, col c at m[c*3+r]) ⇒ column i occupies m[i*3..i*3+2].
  const m = orientation;
  return [
    m[0] * wx + m[1] * wy + m[2] * wz,
    m[3] * wx + m[4] * wy + m[5] * wz,
    m[6] * wx + m[7] * wy + m[8] * wz,
  ];
}
