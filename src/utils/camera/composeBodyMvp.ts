/**
 * composeBodyMvp — compose a full proj·view·model MVP for a spherical body
 * (planet, star, Earth) and return a narrowed f32 matrix ready for GPU upload.
 *
 * ### One unit (Mpc) across all bodies
 *
 * Every body — from Earth (radius ~6,371 km) to a gas giant — is represented
 * as a unit sphere scaled by `radiusMpc`. This keeps the model matrix in the
 * same coordinate frame (Megaparsecs) as the galaxy catalog, so no per-kind
 * native-unit braid (km for planets, AU for orbits, Mpc for galaxies) ever
 * leaks into the composition path. Callers convert once at the call site:
 *
 *     radiusMpc = 6371 * SCALE_UNITS.KM_TO_MPC
 *
 * ### Why compose the FULL MVP in f64 before narrowing (spec §3 / §9)
 *
 * Earth sits at ~1 AU ≈ 4.85×10⁻¹² Mpc from the Sun. The body position is
 * therefore a very small number in Mpc — but the view-projection matrix
 * carries a large translation that nearly cancels it. When that translation
 * is stored in f32 first, the low-order bits (which encode the inter-body
 * separation, ~10⁻¹² Mpc) are already gone. Multiplying an f32 VP by an
 * f32 model matrix therefore places Earth at exactly the wrong position —
 * the error can easily exceed one Earth radius.
 *
 * The fix: compute `proj · view · model` entirely in f64 (`mat4d`), then
 * narrow the resulting 16-element MVP once at the GPU-upload boundary via
 * `narrowMat4`. At that point the small-number arithmetic has already been
 * resolved in high precision, so the f32 elements each carry a well-
 * conditioned value rather than a catastrophically cancelled residual.
 *
 *     f64 foregroundVp  ×  f64 model  →  f64 mvp  →  narrow → f32 MVP
 *                                                      ↑ only here
 *
 * The `foregroundVp` produced by `computeForegroundViewProj` is already
 * renderOrigin-relative, so the model's translation delta must be expressed
 * in the same frame: `bodyPosMpc − renderOrigin`.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';
import { narrowMat4 } from '../math/narrowMat4';

/**
 * Compose a narrowed proj·view·model matrix for a unit sphere centred at
 * `bodyPosMpc`, scaled to `radiusMpc`, in the renderOrigin-relative frame.
 *
 * @param foregroundVp  The f64 proj·view matrix from `computeForegroundViewProj`.
 *                      Already expressed relative to `renderOrigin`.
 * @param bodyPosMpc    Absolute body position in world-space Mpc (heliocentric).
 * @param renderOrigin  The render origin (same value passed to
 *                      `computeForegroundViewProj`).
 * @param radiusMpc     Body radius in Mpc (e.g. `6371 * SCALE_UNITS.KM_TO_MPC`).
 * @returns  A `Float32Array` of 16 values (column-major proj·view·model),
 *           composed entirely in f64 before narrowing to preserve sub-metre
 *           accuracy at 1-AU distances.
 */
export function composeBodyMvp(
  foregroundVp: Float64Array,
  bodyPosMpc: Readonly<Vec3>,
  renderOrigin: Readonly<Vec3>,
  radiusMpc: number,
): Float32Array {
  // Delta in Mpc, expressed in the renderOrigin-relative frame that foregroundVp
  // was built for. Subtracting renderOrigin here mirrors what computeForegroundViewProj
  // does to eye/target — without this subtraction the VP and model matrices live in
  // different frames and the MVP product would be wrong.
  const delta: [number, number, number] = [
    bodyPosMpc[0] - renderOrigin[0],
    bodyPosMpc[1] - renderOrigin[1],
    bodyPosMpc[2] - renderOrigin[2],
  ];

  // Unit sphere → scale by radiusMpc → translate to body centre.
  // mat4d.translation and mat4d.scaling each return a fresh Float64Array.
  // mat4d.multiply(T, S) = T * S; a column-vector v transforms as (T·S)·v,
  // which first scales then translates — correct for "unit sphere at delta".
  const model = mat4d.multiply(
    mat4d.translation(delta),
    mat4d.scaling([radiusMpc, radiusMpc, radiusMpc]),
  ) as Float64Array;

  // Full compose in f64: the cancellation between the large VP translation and
  // the small body-position delta is resolved here, at double precision, before
  // any bits are lost to narrowing.
  const mvp64 = mat4d.multiply(foregroundVp, model) as Float64Array;

  // Narrow once at the GPU-upload boundary. Each element is now well-conditioned
  // (no catastrophic cancellation left), so the f32 rounding error is at most
  // 2^-24 relative — well under one metre at Earth-surface scale.
  return narrowMat4(mvp64);
}
