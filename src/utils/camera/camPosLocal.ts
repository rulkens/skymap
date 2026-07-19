/**
 * camPosLocal — the camera's position expressed in a body's own local frame,
 * measured in body radii (unit-sphere units).
 *
 *   camera position + body position + radius + baked orientation
 *                                                     →  local camera position
 *
 * The PBR fragment needs a view vector, and GGX glint is view-dependent, so it
 * forms `V = normalize(camPosLocal − surfacePosLocal)`. `surfacePosLocal` is the
 * interpolated `normalLocal` — a point on the unit sphere in the body's local
 * frame (`earth/io.wesl:27-35`). To subtract cleanly, the camera position must
 * land in that SAME frame and the SAME units, which is what this util produces.
 *
 * ### Why this keeps magnitude where `sunDirLocal` does not
 *
 * `sunDirLocal` carries a *direction* into the local frame and normalises it —
 * a light direction has no length. The view vector, by contrast, is the
 * *difference of two positions*, so the camera's distance from the body centre
 * matters: it decides where on the sphere the specular highlight sits. Hence we
 * subtract the body centre, rotate, and DIVIDE by `radiusMpc` (rather than
 * normalise) so a camera one radius above the surface lands at |local| = 2, not
 * on the unit sphere.
 *
 * ### Why transpose the orientation
 *
 * A body's baked `orientation` `R` is a *local→world* rotation (the same matrix
 * `composeBodyMvp` embeds as `T·R·S`): its columns are the body-local axes
 * written in world space. To carry a world-space vector *into* the local frame
 * we need the inverse, `R⁻¹`. `R` is orthonormal (a pure rotation), so its
 * inverse is exactly its transpose `Rᵀ` — no general 3×3 inversion required.
 * The local component along local axis `i` is the projection of the world offset
 * onto that axis, i.e. its dot with column `i` of `R`.
 *
 * ### Why compute this CPU-side, per body, per frame
 *
 * `camPosMpc` and `bodyPosMpc` are both origin-relative (heliocentric) Mpc; near
 * Earth their difference is a handful of Mpc riding on a ~kpc-to-Mpc pedestal,
 * so we take it in JS doubles where it resolves cleanly before narrowing to f32
 * — the same precision posture the `earthLayer` f64 seam documents
 * (`earthLayer.ts:16-30`). The shader then receives one already-local vector and
 * skips a per-fragment matrix multiply.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function camPosLocal(
  camPosMpc: Readonly<Vec3>,
  bodyPosMpc: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,
): Vec3 {
  // World-space offset from the body centre to the camera.
  const wx = camPosMpc[0] - bodyPosMpc[0];
  const wy = camPosMpc[1] - bodyPosMpc[1];
  const wz = camPosMpc[2] - bodyPosMpc[2];

  // Rᵀ · offset: local component along local axis i = dot(offset, column i of R).
  // Column-major (cell row r, col c at m[c*3+r]) ⇒ column i occupies m[i*3..i*3+2].
  // Divide by radiusMpc so the result is measured in body radii (unit-sphere
  // units), matching the interpolated normalLocal the fragment subtracts.
  const m = orientation;
  return [
    (m[0] * wx + m[1] * wy + m[2] * wz) / radiusMpc,
    (m[3] * wx + m[4] * wy + m[5] * wz) / radiusMpc,
    (m[6] * wx + m[7] * wy + m[8] * wz) / radiusMpc,
  ];
}
