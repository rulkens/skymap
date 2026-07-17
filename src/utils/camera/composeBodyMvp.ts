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
 * ### The model is `T · R · S` (translate · rotate · scale)
 *
 * A body's model matrix carries three factors: scale the unit sphere to
 * `radiusMpc`, rotate it by the baked `orientation` `R` into its equatorial-
 * world facing, then translate it to the body centre. The rotation sits
 * BETWEEN translate and scale — a column vector transforms as `(T·R·S)·v`, so
 * the spin acts on the sphere at the origin before the translate carries it
 * into place. A rotation-invariant body (a flat-albedo or emissive sphere)
 * passes `IDENTITY_MAT3`, collapsing the model back to `T·S`.
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
import type { Mat3 } from '../../@types/math/Mat3';
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
 * @param orientation   The body's baked local→equatorial-world rotation `R`,
 *                      embedded between translate and scale (`T·R·S`). Pass
 *                      `IDENTITY_MAT3` for a rotation-invariant body (a flat
 *                      albedo / emissive sphere renders identically under `R`).
 * @returns  A `Float32Array` of 16 values (column-major proj·view·model),
 *           composed entirely in f64 before narrowing to preserve sub-metre
 *           accuracy at 1-AU distances.
 */
export function composeBodyMvp(
  foregroundVp: Float64Array,
  bodyPosMpc: Readonly<Vec3>,
  renderOrigin: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,
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

  // Embed the body's baked rotation `R` into the top-left 3×3 block of a mat4d.
  // `Mat3` is a tight 9-element column-major tuple (m[c*3+r]); each of its three
  // columns becomes a mat4 column, with the homogeneous row/column left identity.
  // This is a hand embed, NOT `mat4d.fromMat3` — wgpu-matrix's mat3 is a padded
  // 12-element layout (columns at 0,4,8), so feeding it our tight tuple would
  // read the wrong slots. Placing the columns wrong (a transpose) would mirror
  // every textured body; the round-trip test discriminates that.
  const r = orientation;
  const rot = new Float64Array([
    r[0], r[1], r[2], 0,
    r[3], r[4], r[5], 0,
    r[6], r[7], r[8], 0,
    0, 0, 0, 1,
  ]);

  // Model = T · R · S. A column vector v transforms as (T·R·S)·v — read
  // right-to-left: scale the unit sphere by radiusMpc, rotate it into its
  // equatorial-world facing, then translate it to the body centre. `R` sits
  // between `T` and `S` (not outside both) so the spin acts on the sphere at
  // the origin, before the translation carries it into place — a rotation
  // applied after the translate would swing the body around the render origin.
  // mat4d.translation / scaling each return a fresh Float64Array.
  const model = mat4d.multiply(
    mat4d.multiply(mat4d.translation(delta), rot),
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
