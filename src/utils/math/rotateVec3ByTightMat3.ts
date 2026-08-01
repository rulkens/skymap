/**
 * rotateVec3ByTightMat3 — rotate a `Vec3` by a TIGHT 9-float column-major
 * `Mat3` (cell at row r, column c is `m[c*3 + r]`).
 *
 * `wgpu-matrix`'s `vec3.transformMat3` instead expects the vec4-PADDED
 * 12-float layout WGSL's `mat3x3` uses (columns at flat indices 0, 4, 8), so
 * feeding it one of the registry's tight `Mat3` arrays reads garbage past
 * each column's third element. Three call sites independently reached for
 * this same inline column-major product to decode a frame-local direction
 * into world space without maintaining a second padded copy of the basis
 * (`updatePosition`, `buildPathTrack`, `sampleClipPath`) — this is that
 * product, pulled out to one place.
 *
 * `frameBasis === undefined` is the identity frame: `v` passes through
 * unchanged (copied into `out` when given), so every caller that never sets
 * a frame stays byte-identical to the pre-frame-feature code.
 *
 * @param v            The frame-local vector to rotate.
 * @param frameBasis   Frame-local → world basis (tight column-major 3×3), or
 *                      undefined for the identity frame.
 * @param out          Optional destination written in place and returned; a
 *                      fresh `Vec3` is allocated when omitted — pass a
 *                      caller-owned scratch to keep a per-frame path
 *                      allocation-free (same pattern as `yawPitchToDir`).
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

export function rotateVec3ByTightMat3(
  v: Vec3,
  frameBasis: Readonly<Mat3> | undefined,
  out?: Vec3,
): Vec3 {
  const dst = out ?? ([0, 0, 0] as Vec3);
  if (frameBasis === undefined) {
    dst[0] = v[0];
    dst[1] = v[1];
    dst[2] = v[2];
    return dst;
  }
  // Column c contributes frameBasis[c*3 + 0..2] scaled by the matching input
  // component. Read x/y/z into locals first so `out === v` (in-place) stays safe.
  const x = v[0];
  const y = v[1];
  const z = v[2];
  dst[0] = frameBasis[0] * x + frameBasis[3] * y + frameBasis[6] * z;
  dst[1] = frameBasis[1] * x + frameBasis[4] * y + frameBasis[7] * z;
  dst[2] = frameBasis[2] * x + frameBasis[5] * y + frameBasis[8] * z;
  return dst;
}
