/**
 * composeOrbitMvp — compose a full proj·view·model MVP for an orbit ring (a
 * unit circle in the orbital plane, scaled by the orbital radius) and return
 * a narrowed f32 matrix ready for GPU upload.
 *
 * Sibling of `composeBodyMvp`, with one difference: a sphere body's model
 * matrix is translate·scale only, while an orbit ring's model matrix carries
 * a ROTATED basis — the ring's local xy-plane must land in the orbital plane,
 * so the model's first two columns are the plane's in-plane axes (`uAxis`,
 * `vAxis`) scaled by the radius, and the third is their cross product.  The
 * shader's unit-circle geometry (local xy in [-1.1, 1.1], z = 0) then maps
 * straight onto the world-space orbit.
 *
 * ### Why compose the FULL MVP in f64 before narrowing
 *
 * Identical rationale to `composeBodyMvp` (see its module header for the full
 * derivation): the orbit centres sit at AU-to-lunar distances from the render
 * origin — tiny Mpc numbers (~5e-12 down to ~1e-14) that the view-projection's
 * large translation nearly cancels.  Narrowing the VP or the model to f32
 * BEFORE multiplying destroys the low-order bits that encode the separation;
 * the ring would land visibly off its body.  Composing `vp · model` entirely
 * in f64 (`mat4d`) resolves the cancellation at double precision, and the
 * single `narrowMat4` at return leaves each f32 element well-conditioned.
 *
 *     f64 slabVp  ×  f64 model  →  f64 mvp  →  narrow → f32 MVP
 *                                                ↑ only here
 *
 * ### The model matrix, column by column
 *
 * Column-major mat4 columns (wgpu-matrix convention — a column-vector `v`
 * transforms as `M·v`):
 *
 *   col 0: uAxis · radiusMpc   — local +x → in-plane axis toward the body
 *   col 1: vAxis · radiusMpc   — local +y → the orthogonal in-plane axis
 *   col 2: (u × v) · radiusMpc — local +z → the plane normal (scaled for a
 *                                uniform basis; the geometry's z is 0, so the
 *                                scale is inert but keeps the matrix invertible)
 *   col 3: centerMpc − renderOriginMpc — the ring centre in the renderOrigin-
 *                                relative frame the slab VP was built for
 *
 * `mat4d.create()` returns ZEROS (not identity — the wgpu-matrix landmine), so
 * every element that matters is written explicitly, including m[15] = 1.
 *
 * @param slabVpF64        The slab's f64 proj·view (`view.slab.vp` — the f64
 *                         seam; never the f32 `view.vp`).
 * @param centerMpc        Orbit centre (the parent body) in absolute Mpc.
 * @param uAxis            Unit in-plane axis aimed at the orbiting body.
 * @param vAxis            Unit in-plane axis orthogonal to `uAxis`.
 * @param radiusMpc        Orbital radius in Mpc.
 * @param renderOriginMpc  The render origin the slab VP is relative to.
 * @returns  A `Float32Array` of 16 values (column-major proj·view·model),
 *           composed entirely in f64 before narrowing.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';
import { narrowMat4 } from '../math/narrowMat4';

export function composeOrbitMvp(
  slabVpF64: Float64Array,
  centerMpc: Readonly<Vec3>,
  uAxis: Readonly<Vec3>,
  vAxis: Readonly<Vec3>,
  radiusMpc: number,
  renderOriginMpc: Readonly<Vec3>,
): Float32Array {
  // The plane normal completes the rotated basis: local +z. Computed here
  // rather than passed in — (u, v) fully determine it, and one fewer argument
  // means one fewer way for a caller to hand in an inconsistent triple.
  const nx = uAxis[1] * vAxis[2] - uAxis[2] * vAxis[1];
  const ny = uAxis[2] * vAxis[0] - uAxis[0] * vAxis[2];
  const nz = uAxis[0] * vAxis[1] - uAxis[1] * vAxis[0];

  // Model matrix in f64, column-major. mat4d.create() returns zeros, so every
  // needed element is assigned explicitly.
  const model = mat4d.create() as Float64Array;
  // col 0: uAxis · r
  model[0] = uAxis[0] * radiusMpc;
  model[1] = uAxis[1] * radiusMpc;
  model[2] = uAxis[2] * radiusMpc;
  // col 1: vAxis · r
  model[4] = vAxis[0] * radiusMpc;
  model[5] = vAxis[1] * radiusMpc;
  model[6] = vAxis[2] * radiusMpc;
  // col 2: (u × v) · r
  model[8] = nx * radiusMpc;
  model[9] = ny * radiusMpc;
  model[10] = nz * radiusMpc;
  // col 3: centre in the renderOrigin-relative frame (the same subtraction
  // composeBodyMvp performs — the VP and model must speak the same frame).
  model[12] = centerMpc[0] - renderOriginMpc[0];
  model[13] = centerMpc[1] - renderOriginMpc[1];
  model[14] = centerMpc[2] - renderOriginMpc[2];
  model[15] = 1;

  // Full compose in f64: the large-VP-translation vs tiny-centre cancellation
  // is resolved here, at double precision, before any bits are lost.
  const mvp64 = mat4d.multiply(slabVpF64, model) as Float64Array;

  // Narrow once at the GPU-upload boundary.
  return narrowMat4(mvp64);
}
