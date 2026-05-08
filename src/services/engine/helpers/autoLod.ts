/**
 * autoLod — survey visibility heuristic driven by camera distance.
 *
 * This module owns one pure function — `autoLodMask` — which maps the camera's
 * current distance from the origin to a `Source` bitmask of which surveys
 * should be rendered.  The renderer evaluates per-point visibility on the GPU
 * via a single `mask & (1 << source)` test (see `data/sources.ts`), so the
 * choice this function makes is essentially free at draw time.
 *
 * The heuristic itself is a three-band step function rather than a smooth
 * blend — see the `autoLodMask` docstring for the astrophysical reasoning
 * behind the band boundaries.
 *
 * Kept in its own file because (a) it is exported as part of the engine's
 * public API and consumed by tests directly, and (b) the explanation behind
 * the band choices is long and would otherwise dominate `engine.ts`.
 */

import { ALL_VISIBLE_MASK, Source, maskWith } from '../../../data/sources';

/**
 * Pick which surveys should be visible at a given camera distance from the
 * origin, returning a `Source` bitmask.
 *
 * The renderer evaluates per-point visibility on the GPU via a single
 * `mask & (1 << source)` test (see `data/sources.ts`), so the work this
 * function does — choosing the *right* mask for the current zoom level —
 * is essentially free at draw time.
 *
 * ### Why three bands instead of a smooth blend?
 *
 * Each survey has a real, physical effective depth (see `MAX_DIST_MPC` in
 * `data/sources.ts`). There's no value in showing 2MRS at 5000 Mpc — its
 * deepest galaxies sit around 250 Mpc, so beyond that it contributes
 * nothing but a tiny wedge of dots near the centre. Conversely SDSS is
 * sparse at < 200 Mpc — it's a *deep* survey, not a *nearby* one, and
 * showing it up close just adds noise to the local-universe view.
 *
 * Three discrete bands map the camera's zoom intent to surveys whose
 * coverage is actually relevant:
 *
 * - **< 200 Mpc — local view.**  2MRS (~250 Mpc effective depth) and GLADE
 *   are the nearby all-sky catalogs; they dominate the local universe
 *   (GLADE's parent merge of 2MPZ + 6dFGS + HyperLEDA fills in 2MRS's
 *   thin near regions). SDSS is hidden because it contributes almost
 *   nothing this close in.
 * - **200–800 Mpc — mid range.**  This is the overlap zone where every
 *   catalog has meaningful coverage, so we render all of them
 *   (`ALL_VISIBLE_MASK`) for the richest possible view.
 * - **> 800 Mpc — deep view.**  Only SDSS reaches this far (effective
 *   depth ~3000 Mpc); the others would be reduced to a barely-visible
 *   speck at the centre, so we drop them.
 *
 * **Synthetic is always included.**  When the real `.bin` file is missing
 * the engine falls back to a procedurally-generated cloud (see
 * `loadCloud`). If we ever masked Synthetic out in any band, the fallback
 * would silently disappear from view and the canvas would look empty —
 * exactly when the user most needs *something* visible. Keeping it on at
 * every distance costs nothing for real-data renders (the bit is set but
 * no points carry `Source.Synthetic`) and keeps the fallback robust.
 *
 * @param distanceMpc — current camera distance from the origin, in Mpc.
 * @returns a `Source` bitmask suitable for the GPU visibility uniform.
 */
export function autoLodMask(distanceMpc: number): number {
  // Always start from a mask that includes Synthetic — see docstring for why.
  const synthetic = maskWith(0, Source.Synthetic);

  if (distanceMpc < 200) {
    // Local view: only the nearby all-sky surveys contribute meaningfully.
    // We keep GLADE in the close-up band even though its effective depth is
    // much greater (~1.5 Gpc) — its low-redshift end overlaps 2MRS and helps
    // fill in regions where 2MRS's K_s flux limit leaves the volume sparse.
    return maskWith(maskWith(synthetic, Source.TwoMRS), Source.Glade);
  }

  if (distanceMpc <= 800) {
    // Mid range: every survey overlaps this zone, so show everything.
    // ALL_VISIBLE_MASK already includes Synthetic, so no explicit OR needed.
    return ALL_VISIBLE_MASK;
  }

  // Deep view: only SDSS reaches out this far.
  return maskWith(synthetic, Source.SDSS);
}
