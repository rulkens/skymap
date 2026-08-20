/**
 * composeBodyMvp — compose a full proj·view·model MVP for a spherical body
 * (planet, star, Earth), entirely in f64. Callers narrow to f32 themselves,
 * at whichever point their OWN use actually needs f32 — see "Why f64 all the
 * way out" below.
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
 * passes `IDENTITY_MAT3`, collapsing the rotation to a no-op.
 *
 * ### Oblateness — a per-axis model scale composed INSIDE the oriented frame
 *
 * A rotating star is an oblate spheroid: its equatorial radius exceeds its
 * polar radius. Rather than teach the sphere renderer (its mat4 + tint uniform
 * is deliberately minimal) about flattening, the spheroid is baked into the
 * CPU-side model scale — the two equatorial axes scale by `radiusMpc`, the
 * polar (model-Z) axis by `radiusMpc·(1 − oblateness)`. A sphere is just the
 * `oblateness = 0` case, so the default leaves every uniform-radius caller
 * (Earth, planets) composing exactly the matrix they did before.
 *
 * Because the flatten lives in `S` — the INNERMOST model factor — the
 * orientation `R` rotates the ALREADY-flattened spheroid: a tilted oblate body
 * flattens along its OWN pole (its local +Z carried into world by `R`), not
 * along world-Z. A rotation-invariant star passes `IDENTITY_MAT3`, so its pole
 * stays fixed to model **Z** — a deliberate simplification (the seed carries no
 * pole vector) that renders the flattening as a Z-flatten, the visually
 * dominant effect for a lone resolved star. A per-star pole vector is a future
 * orientation field; once it exists, that star's flatten tilts with it for free.
 *
 * ### Why compose the FULL MVP in f64, and stay f64 on return
 *
 * Earth sits at ~1 AU ≈ 4.85×10⁻¹² Mpc from the Sun. The body position is
 * therefore a very small number in Mpc — but the view-projection matrix
 * carries a large translation that nearly cancels it. Narrowing either
 * operand to f32 before the multiply loses the low-order bits that encode
 * the inter-body separation, misplacing the body by more than one radius.
 * `proj · view · model` is therefore computed entirely in f64 (`mat4d`).
 *
 * The result USED to narrow to f32 here too, on the reasoning that once the
 * cancellation above is resolved every element is "well-conditioned". That
 * held for every GPU-drawing caller (a sphere renderer's uniform write), but
 * `prepareEarthFrame` (`earthLayer.ts`) also feeds this SAME mvp to
 * `cutSurfaceTiles`, a CPU-side walk evaluating `mvp·p` at ground points
 * metres from the camera. There the `w`-row cancels its OWN large terms (the
 * `radiusMpc`-scale entries this function's model factor writes) down to
 * `w≈10⁻²¹` at ~60 m altitude — a SECOND, independent cancellation, internal
 * to this matrix rather than to the position delta above. Narrowing before
 * that walk runs reintroduces per-element f32 rounding at a magnitude that is
 * now a ~1% relative error on `w`, enough to corrupt the walk's bbox-cull
 * test and drop tiles that are actually on screen — see
 * `.superpowers/sdd/2026-08-20-earth-rtc-surface-foundation/cut-replay-exact-report.md`.
 * So this function returns the raw f64 result; a GPU-drawing caller narrows
 * via `narrowMat4` at its OWN upload site, and the CPU planner keeps `mvpLocal`
 * `Float64Array` all the way into `cutSurfaceTiles`.
 *
 * The `foregroundVp` produced by `computeForegroundViewProj` is already
 * renderOrigin-relative, so the model's translation delta must be expressed
 * in the same frame: `bodyPosMpc − renderOrigin`.
 */

import { mat4d } from 'wgpu-matrix';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Compose a f64 proj·view·model matrix for a unit sphere centred at
 * `bodyPosMpc`, scaled to `radiusMpc`, in the renderOrigin-relative frame.
 * NOT narrowed — see the module header for why narrowing is the caller's job.
 *
 * @param foregroundVp  The f64 proj·view matrix from `computeForegroundViewProj`.
 *                      Already expressed relative to `renderOrigin`.
 * @param bodyPosMpc    Absolute body position in world-space Mpc (heliocentric).
 * @param renderOrigin  The render origin (same value passed to
 *                      `computeForegroundViewProj`).
 * @param radiusMpc     Equatorial body radius in Mpc (e.g.
 *                      `6371 * SCALE_UNITS.KM_TO_MPC`).
 * @param orientation   The body's baked local→equatorial-world rotation `R`,
 *                      embedded between translate and scale (`T·R·S`). Pass
 *                      `IDENTITY_MAT3` for a rotation-invariant body (a flat
 *                      albedo / emissive sphere renders identically under `R`).
 * @param oblateness    Flattening `(a − c)/a`; the polar (model-Z) axis scales
 *                      by `radiusMpc·(1 − oblateness)` INSIDE the oriented frame,
 *                      so the flatten tilts with `orientation`. Defaults to `0`
 *                      (a true sphere), leaving uniform-radius callers unchanged.
 * @returns  A `Float64Array` of 16 values (column-major proj·view·model),
 *           composed entirely in f64. Narrow via `narrowMat4` before a GPU
 *           uniform write; a CPU-side consumer (the surface-tile planner)
 *           must keep it f64 — see the module header.
 */
export function composeBodyMvp(
  foregroundVp: Float64Array,
  bodyPosMpc: Readonly<Vec3>,
  renderOrigin: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,
  oblateness = 0,
): Float64Array {
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
    r[0],
    r[1],
    r[2],
    0,
    r[3],
    r[4],
    r[5],
    0,
    r[6],
    r[7],
    r[8],
    0,
    0,
    0,
    0,
    1,
  ]);

  // Model = T · R · S. A column vector v transforms as (T·R·S)·v — read
  // right-to-left: scale the unit sphere (equatorial axes X,Y by radiusMpc; the
  // polar axis Z shortened by 1 − oblateness so oblateness 0 is a true sphere),
  // rotate the spheroid into its equatorial-world facing, then translate it to
  // the body centre. `S` is the INNERMOST factor, so `R` flattens the pole along
  // the body's OWN axis, not world-Z. `R` sits between `T` and `S` (not outside
  // both) so the spin acts on the sphere at the origin, before the translation
  // carries it into place — a rotation applied after the translate would swing
  // the body around the render origin. mat4d.translation / scaling each return a
  // fresh Float64Array.
  const model = mat4d.multiply(
    mat4d.multiply(mat4d.translation(delta), rot),
    mat4d.scaling([radiusMpc, radiusMpc, radiusMpc * (1 - oblateness)]),
  ) as Float64Array;

  // Full compose in f64: the cancellation between the large VP translation and
  // the small body-position delta is resolved here, at double precision. NOT
  // narrowed — see the module header for why that is now the caller's job.
  return mat4d.multiply(foregroundVp, model) as Float64Array;
}
