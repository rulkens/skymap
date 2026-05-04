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
 * Returns a `Float32Array` of length `cloud.count` carrying a *boost-direction*
 * Schechter density correction with a soft (Reinhard-style) cap.  The intent
 * is to compensate for Malmquist bias in the visualisation: at each distance
 * we observe only galaxies brighter than the survey's apparent-mag flux
 * limit, so the far-field looks artificially sparse — each surviving point
 * actually represents many invisible faint companions.  The boost factor
 * up-weights those representative survivors so the rendered density looks
 * closer to the true (uniform) underlying distribution.
 *
 * The previous "dim-only" formula (`min(1, sqrt(N_ref / n(d)))`) collapsed
 * to 1.0 everywhere, because `nRef = n(d=10 Mpc)` is the maximum density
 * (faintest galaxies still inside the integration window), so `nRef / n(d)`
 * is ≥1 for every d > 10 Mpc and the `min(1, …)` clamp pinned the result.
 * Mode 3 became a no-op.  The new formula:
 *
 *   `ratio = 1 + softCap · ( (sqrt(r) − 1) / (softCap + sqrt(r) − 1) )`,
 *   where `r = N_ref / n(d)` and `softCap = 2`.
 *
 * Properties:
 *   - r = 1 (galaxy at the reference distance) → ratio = 1 (no change).
 *   - r large → ratio asymptotically approaches `1 + softCap = 3`.
 *   - The intermediate sqrt softens the growth so the boost reaches its
 *     plateau well before n(d) is dominated by integration noise.
 *   - r < 1 (galaxies *closer* than the reference, where n(d) > nRef)
 *     clamps to ratio = 1 — we never *dim* in mode 3, only boost.
 *
 * Degenerate values (NaN distances, n(d) ≤ 0) collapse to 1 (no boost), so
 * far-field rows with collapsed integration windows render at their natural
 * alpha rather than spiking to infinity.
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

  // Soft-cap parameter: the boost asymptote is 1 + SOFT_CAP, so the maximum
  // multiplier any galaxy receives is 3.0×.  Chosen empirically — earlier
  // hard clamps at 10 / 5 over-exposed the bright far-field tail; 3.0 keeps
  // the visual boost noticeable without saturating the bright cluster
  // outliers.  Bumping this needs a visual smoke-check, not just a unit
  // test: the eye is the judge for "does the far field still look natural?".
  const SOFT_CAP = 2;

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

    // Boost direction with Reinhard-style soft cap.  See the @module docstring
    // for the full derivation; the short version is:
    //   r = nRef/n(d) is ≥1 for d > 10 Mpc (because nRef = n(10) is the
    //   density ceiling).  We softly map r ∈ [1, ∞) → ratio ∈ [1, 1+SOFT_CAP).
    //   The Reinhard form `x · cap / (cap + x)` saturates smoothly toward
    //   `cap` as x → ∞ without the hard truncation that earlier versions
    //   used (which produced visible banding at the cap boundary).
    //
    // Degenerate `nHere` (≤0 or NaN — happens at extreme distances where the
    // integration window collapses) maps to r=1 → ratio=1.  Those rows render
    // at their natural alpha, neither boosted nor dimmed.
    const r =
      nHere > 0 && Number.isFinite(nHere) ? nRef / nHere : 1;
    // sqrt softens the inner growth: without it, even small d > 10 Mpc
    // (where r is only ~2-3) saturates the soft cap quickly.  With sqrt
    // we get a more gradual climb across the distance range that matters
    // visually (50–500 Mpc).
    const softened = Math.max(0, Math.sqrt(r) - 1);
    const tonemapped = (SOFT_CAP * softened) / (SOFT_CAP + softened);
    ratios[i] = 1 + tonemapped;
  }

  return ratios;
}
