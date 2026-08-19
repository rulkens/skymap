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
 * Returns a `Float32Array` of length `cloud.count` carrying a *symmetric
 * rebalancing* Schechter density correction.  The intent is to compensate
 * for Malmquist bias in the visualisation: at each distance we observe
 * only galaxies brighter than the galaxy catalog's apparent-mag flux limit, so
 * the far-field is artificially sparse and the near-field is artificially
 * dense.  The correction reshuffles alpha *between* near and far without
 * changing the total — additive blending across ~3 M visible galaxies
 * over-saturates with even modest pure-boost factors, so any version that
 * pushes ratios uniformly above 1 blows out the rendered brightness.
 *
 * **Algorithm.** For each galaxy compute the galaxy catalog's predicted observable
 * number density `n(d)` at its distance.  Take the cloud's median `n(d)`
 * as the reference `n_mid`.  The per-galaxy ratio is then
 *
 *   `ratio = clamp( sqrt(n_mid / n(d)) , 0.3, 1.2 )`
 *
 * Properties:
 *   - Galaxies at the cloud's median density: `ratio = 1` (no change).
 *   - High-density distance shells (typically near-field): `ratio < 1` (dim).
 *   - Low-density distance shells (typically far-field): `ratio > 1` (boost).
 *   - Total alpha integrated over the cloud stays roughly constant by
 *     construction — the median pivot keeps roughly half the rows below 1
 *     and half above.
 *   - The asymmetric clamp `[0.3, 1.2]` reflects additive blending's
 *     tolerance: cumulative alpha tolerates dimming far better than
 *     boosting, so we cap the upside tightly while letting the downside
 *     drop to a tenth of full alpha.
 *
 * **Why iterations of "boost-only" failed.** Earlier passes tried
 * `min(1, sqrt(N_ref / n(d)))` (collapsed to 1 — no-op), un-clamped raw
 * ratio (over-exposed), and a Reinhard-soft-cap boost asymptoting at
 * 1.3× and 3× (still over-exposed because the cumulative alpha across
 * millions of additive-blended points saturates with *any* ratio > 1
 * applied uniformly).  Symmetric rebalancing is the only formulation
 * that preserves total brightness while still spatially redistributing
 * alpha — see commit history for the iteration trail.
 *
 * Degenerate values (NaN distances, n(d) ≤ 0) collapse to 1 (no change).
 *
 * @module
 */

import type { ComputeSchechterRatiosInput } from '../../../@types/engine/ComputeSchechterRatiosInput';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../../data/galaxyCatalog/galaxyCatalogFluxLimits';
import { expectedNumberDensity } from '../../../utils/math';

/**
 * Compute per-galaxy Schechter density-correction ratios for one cloud.
 *
 * The result is a tightly-packed `Float32Array` (length = cloud.count) — NOT
 * an interleaved vertex slice.  The caller (`galaxyPointRenderer.bakeSchechterRatios`,
 * invoked via the public `setBiasMode(BiasMode.Schechter)` entry point)
 * folds these into the appropriate slot of the live mirror Float32Array
 * before re-uploading the whole vertex buffer in a single
 * `device.queue.writeBuffer` call.  See the long comment in
 * `galaxyPointRenderer.bakeSchechterRatios` for why we pay the full re-upload
 * cost rather than issuing N sparse writes.
 */
export function computeSchechterRatios(input: ComputeSchechterRatiosInput): Float32Array {
  const { cloud, source } = input;

  // Hoist constants outside the per-galaxy loop — these depend only on the
  // galaxy catalog, not on any individual row.
  const mLim = galaxyCatalogFluxLimit(source);
  const schechter = galaxyCatalogSchechter(source);

  // Pass 1 — compute n(d) for every galaxy.  We need the full distribution
  // before we can pick the reference (the median across the cloud), so the
  // bake is necessarily two-pass.  Cost is dominated by the per-row
  // 200-step integral inside `expectedNumberDensity`, not by the second
  // pass's O(n) clamp+sqrt.
  const nHereArr = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const dx = cloud.positions[i * 3 + 0]!;
    const dy = cloud.positions[i * 3 + 1]!;
    const dz = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(dx, dy, dz);
    const nHere = expectedNumberDensity({ ...schechter, mLim, dMpc });
    nHereArr[i] = Number.isFinite(nHere) && nHere > 0 ? nHere : 0;
  }

  // Reference = median of the populated `n(d)` values.  Sampling the array
  // before sorting keeps the median computation O(k log k) (k=4096) instead
  // of O(N log N) on a multi-million-row cloud — and a sample-of-4096
  // median on a smooth-monotone distribution is well within 1 % of the
  // true median, far inside the empirical tolerance the user's eye cares
  // about.  We deliberately use a typed-array sort over a sliced sample
  // rather than `nthElement` — the sample is small enough that extra
  // simplicity wins over algorithmic optimality.
  const SAMPLE_SIZE = 4096;
  const stride = Math.max(1, Math.floor(cloud.count / SAMPLE_SIZE));
  const sample: number[] = [];
  for (let i = 0; i < cloud.count; i += stride) {
    const v = nHereArr[i]!;
    if (v > 0) sample.push(v);
  }
  sample.sort((a, b) => a - b);
  const nMid = sample.length > 0 ? sample[Math.floor(sample.length / 2)]! : 1;

  // Pass 2 — per-galaxy ratio = clamp(sqrt(n_mid / n_here), 0.3, 1.2).
  // The asymmetric clamp reflects additive-blending tolerance: cumulative
  // alpha tolerates dimming much better than boosting, so we cap the
  // upside at 1.2× while letting the downside drop to 0.3×.  Why sqrt:
  // softens the spread so the bulk of the cloud lives near 1.0; without
  // it the long-tailed n(d) distribution would push most rows hard
  // against one of the clamp boundaries, producing visible banding.
  const RATIO_MIN = 0.3;
  const RATIO_MAX = 1.2;
  const ratios = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const nHere = nHereArr[i]!;
    if (nHere <= 0) {
      ratios[i] = 1;
      continue;
    }
    const r = Math.sqrt(nMid / nHere);
    ratios[i] = Math.max(RATIO_MIN, Math.min(RATIO_MAX, r));
  }

  return ratios;
}
