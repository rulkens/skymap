/**
 * computeSchechterRatios — pure helper for the per-galaxy Schechter density
 * correction ratios.
 *
 * ### Why this lives in its own module
 *
 * The original implementation baked these ratios into every vertex during
 * `buildPointInterleavedBuffer`, regardless of whether the user would ever
 * select Schechter LF mode in the bias-correction picker.  For a fully-loaded
 * SDSS + 2MRS + GLADE deck (~3.5 M galaxies) that's roughly 700 M math ops
 * (each row runs a 200-step trapezoidal integral over absolute magnitude) —
 * all of it wasted if the user never picks mode 3.
 *
 * The new architecture defers the work: at upload time `schechterRatio` is
 * left as the multiplicative identity (1.0), and ratios are computed lazily
 * the first time the user selects `BiasMode.Schechter`.  This module is the
 * pure function that does the bake, extracted so it can be:
 *
 *   1. Called from a Web Worker (`.worker.ts` sibling) so the main thread
 *      stays responsive during the 1–2 s integral run.
 *   2. Called inline from `buildPointInterleavedBuffer` when an upload
 *      happens *while* Schechter mode is already active (so the buffer
 *      arrives with correct ratios baked in — no flicker on mode switch).
 *
 * Pure: no `this`, no DOM globals, no module-level mutable state — safe to
 * import from a worker bundle.
 *
 * ### Output semantics
 *
 * Returns a `Float32Array` of length `cloud.count` where each entry is
 * `min(1, sqrt(N_ref / n(d_i)))` — the same dim-only-clamp formula the
 * inline version of `buildPointInterleavedBuffer` used to write into slot
 * 11.  Degenerate values (NaN distances, n(d) ≤ 0) collapse to 0 so far-
 * field rows with no detectable density disappear in mode 3 instead of
 * spiking infinity.
 *
 * @module
 */

import type { PointCloud } from '../../@types';
import { Source } from '../../data/sources';
import { surveyFluxLimit, surveySchechter } from '../../data/surveyFluxLimits';
import { expectedNumberDensity } from '../../utils/math';

/** Inputs for a Schechter-ratio bake. */
export type ComputeSchechterRatiosInput = {
  /** Point cloud whose galaxies need per-row Schechter ratios. */
  cloud: PointCloud;
  /** Survey this cloud belongs to — drives `mLim` and the Schechter triple. */
  source: Source;
};

/**
 * Compute per-galaxy Schechter density-correction ratios for one cloud.
 *
 * The result is a tightly-packed `Float32Array` (length = cloud.count) — NOT
 * an interleaved vertex slice.  The caller (`pointRenderer.applySchechterMode`)
 * folds these into the appropriate slot of the live mirror Float32Array
 * before re-uploading the whole vertex buffer in a single
 * `device.queue.writeBuffer` call.  See the long comment in
 * `pointRenderer.applySchechterMode` for why we pay the full re-upload cost
 * rather than issuing N sparse writes.
 */
export function computeSchechterRatios(
  input: ComputeSchechterRatiosInput,
): Float32Array {
  const { cloud, source } = input;

  // Hoist constants outside the per-galaxy loop — these depend only on the
  // survey, not on any individual row.  Same pattern as the original
  // `buildPointInterleavedBuffer` inline loop.
  const mLim = surveyFluxLimit(source);
  const schechter = surveySchechter(source);
  const nRef = expectedNumberDensity({
    ...schechter,
    mLim,
    dMpc: 10,
  });

  const ratios = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const dx = cloud.positions[i * 3 + 0]!;
    const dy = cloud.positions[i * 3 + 1]!;
    const dz = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(dx, dy, dz);

    const nHere = expectedNumberDensity({
      ...schechter,
      mLim,
      dMpc,
    });

    // Dim-only clamp: `min(1, sqrt(nRef/nHere))`.  Bright nearby clusters
    // dim toward the far-field's natural alpha; far-field stays unboosted.
    // Degenerate cases (n(d)=0, NaN) collapse to 0 — those rows vanish in
    // mode 3 instead of going infinite.
    const ratioRaw =
      nHere > 0 && Number.isFinite(nHere) ? nRef / nHere : 0;
    ratios[i] = Math.min(1, Math.sqrt(ratioRaw));
  }

  return ratios;
}
