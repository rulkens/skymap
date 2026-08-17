/**
 * computeAngularWeights — pure helper for the per-galaxy HEALPix angular
 * re-weighting bias correction (BiasMode.AngularReweight = 4).
 *
 * ### Why this exists
 *
 * GLADE is a compilation of multiple parent catalogues with non-uniform
 * angular completeness — beyond ~600 Mpc it is dominated by SDSS-DR12 inside
 * the SDSS footprint and by HyperLEDA/2MASS XSC outside.  Visually the
 * resulting cloud has pencil-beam-like "jets" of galaxies extending radially
 * from the origin in the directions where the deepest parent catalogue (SDSS)
 * has coverage.  Task 7 of the malmquist-bias plan addressed part of this at
 * parse time (drop SDSS-DR12-only rows); the user reports residual angular
 * non-uniformity that this runtime correction handles.
 *
 * ### Algorithm — per-cloud, per-(cell, distance shell) median normalisation
 *
 * 1. Tile the sky into HEALPix cells at `nside = 32` (12 288 cells, ~1.83°
 *    per cell — fine enough to resolve galaxy catalog footprints, coarse enough that
 *    each populated cell carries tens-to-hundreds of galaxies for a stable
 *    density estimate).
 * 2. For each galaxy, compute (RA, Dec, distance) from the Cartesian position
 *    and bin it into a (cell, distance shell) two-key bin.  Distance shells
 *    are 10 log-spaced bins between the cloud's min and max distance — per
 *    cloud, never globally, because 2MRS reaches ~250 Mpc and GLADE reaches
 *    ~1 Gpc, and a global shell choice would lump GLADE's far tail into one
 *    bin.
 * 3. Per shell, compute the median count across all populated cells in that
 *    shell.  Median (not mean) so a few hyper-dense cells don't drag the
 *    reference up.
 * 4. Per galaxy, weight = clamp(medianCount[shell] / count[cell, shell],
 *    0.1, 10).  Galaxies in dense cells get weight < 1 (they're
 *    over-represented); galaxies in sparse cells get weight > 1 (they're
 *    under-represented).
 *
 * ### Why per-galaxy-catalog, never global
 *
 * Each cloud bins itself.  A unified all-source LUT would let SDSS's
 * footprint contaminate GLADE's correction (or vice versa), turning the
 * correction into a different cosmetic effect entirely.  Mode 4 is a
 * pencil-beam fix for the galaxy catalog it's loaded into, full stop.
 *
 * ### Why typed-array tables instead of nested Maps
 *
 * GLADE has ~2.5 M galaxies.  A `Map<cellIdx, Map<binIdx, number>>` would
 * allocate hundreds of thousands of nested-Map entries plus per-galaxy
 * `set`/`get` calls.  A flat `Float32Array(12288 * 10)` of length 122 880 is
 * a single contiguous allocation, indexed in O(1) per galaxy with no
 * allocations in the hot loop.  The cost is 480 KB — negligible.
 *
 * @module
 */

import type { ComputeAngularWeightsInput } from '../../../@types/engine/ComputeAngularWeightsInput';
import { cartesianToRaDec } from '../../../utils/math';
import { healpixNest } from '../../../utils/math/healpixNest';

/** HEALPix resolution.  See module docstring for choice rationale. */
const NSIDE = 32;
const N_CELLS = 12 * NSIDE * NSIDE; // = 12288

/** Number of log-spaced distance shells per cloud. */
const N_SHELLS = 10;

/**
 * Per-galaxy weight clamp bounds — asymmetric, dim-heavy.
 *
 * The original `[0.1, 10]` was symmetric in log-space and produced a "thick
 * bright shell" at the outer edge of the data: in the deepest shells (last
 * 1-2 of 10) only a small fraction of cells are populated, and those have
 * low counts (1-5 galaxies each).  The per-shell median across populated
 * cells is therefore also small (~3), so a cell with count 1 gets
 * `weight = 3/1 = 3` — boosted 3× toward the cap.  Outer-rim galaxies
 * lit up brighter than they should because additive blending compounded
 * the per-cell boost.
 *
 * The asymmetric `[0.3, 1.2]` mirrors the shape we landed for the Schechter
 * rebalance (commit `d7f1627`).  Same logic: additive-blending tolerance is
 * not symmetric — dimming is cheap, boosting compounds and saturates.
 * Capping the boost at 1.2× lets the angular re-weighting still tame
 * pencil-beam jets across the sky (the original design goal) without
 * over-amplifying the legitimately-sparse outer-shell cells (the side
 * effect we're fixing).
 *
 * Note that the algorithm has a conceptual mismatch the clamp can't fully
 * resolve: HEALPix re-weighting was designed for the angular dimension
 * (sparse cell = under-represented → boost correct), but it incidentally
 * normalises the radial dimension too (sparse cell at deep shell = edge of
 * data → boost wrong).  The asymmetric clamp is the practical workaround;
 * a proper fix would be to skip per-galaxy correction in shells with
 * fewer than e.g. 1000 populated cells (Option B in the design notes).
 */
const WEIGHT_MIN = 0.3;
const WEIGHT_MAX = 1.2;

/**
 * Compute per-galaxy HEALPix angular re-weighting factors for one cloud.
 *
 * The result is a tightly-packed `Float32Array` (length = cloud.count) — one
 * weight per galaxy.  The caller (`galaxyPointRenderer.bakeAngularWeights`,
 * invoked via the public `setBiasMode(BiasMode.AngularReweight)` entry
 * point) folds these into the appropriate slot of the live mirror Float32Array
 * before re-uploading the whole vertex buffer in a single
 * `device.queue.writeBuffer` call.
 *
 * The optional `weightMin` / `weightMax` bounds default to the
 * visualisation-tuned [0.3, 1.2] (dim-heavy, additive-blending tolerant).
 * Override e.g. to [1.0, 15] for build-time point-duplication use where
 * amplification > 1× is needed and dimming below 1× is impossible.
 */
export function computeAngularWeights(input: ComputeAngularWeightsInput): Float32Array {
  const { cloud, weightMin = WEIGHT_MIN, weightMax = WEIGHT_MAX } = input;
  const N = cloud.count;
  const weights = new Float32Array(N);

  if (N === 0) return weights;

  // ── Pass 1: derive per-galaxy (cell, shell) and distance range ──────────
  //
  // We allocate two small typed arrays per galaxy — cellIdx (Int32Array) and
  // distance (Float32Array) — so passes 2/3 don't need to recompute the
  // expensive `cartesianToRaDec + healpixNest` call.  Together that's
  // 8 bytes per galaxy = ~20 MB at full GLADE; fine.
  const cellIdxArr = new Int32Array(N);
  const distArr = new Float32Array(N);
  let dMin = Infinity;
  let dMax = -Infinity;

  for (let i = 0; i < N; i++) {
    const x = cloud.positions[i * 3 + 0]!;
    const y = cloud.positions[i * 3 + 1]!;
    const z = cloud.positions[i * 3 + 2]!;
    const d = Math.hypot(x, y, z);
    distArr[i] = d;
    if (d > 0 && Number.isFinite(d)) {
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
    // cartesianToRaDec guards d=0 and clamps before asin/atan2 — safe to
    // call unconditionally.  Returns RA in [0, 360) and Dec in [-90, +90].
    const [raDeg, decDeg] = cartesianToRaDec(x, y, z);
    cellIdxArr[i] = healpixNest(raDeg, decDeg, NSIDE);
  }

  // Edge case: a degenerate cloud with no positive distances.  Return all
  // 1.0 (multiplicative identity) so the GPU still renders unchanged.  The
  // distance binning below would otherwise divide by zero.
  if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMin >= dMax) {
    weights.fill(1);
    return weights;
  }

  // ── Pass 2: bin galaxies into (cell, shell) and accumulate counts ───────
  //
  // Shell index is `floor(log10(d / dMin) / log10(dMax / dMin) * N_SHELLS)`,
  // clamped to [0, N_SHELLS - 1].  Log-spaced shells are critical for the
  // wide dynamic range of GLADE (1 Mpc ↔ 1 Gpc, three orders of magnitude);
  // linear shells would put the entire local universe in shell 0.
  //
  // Counts table: row-major, count[cell * N_SHELLS + shell].  N_CELLS *
  // N_SHELLS = 122 880 entries, ~480 KB as Float32Array.
  const counts = new Float32Array(N_CELLS * N_SHELLS);
  // Per-galaxy shell index, used in pass 4 to look up the divisor.
  const shellIdxArr = new Int8Array(N);

  const logSpan = Math.log10(dMax / dMin);
  // Guard against dMax == dMin (single-point or identical-distance cloud).
  // Falls into the "all 1.0" fast path above, but just in case.
  const invLogSpan = logSpan > 0 ? 1 / logSpan : 0;

  for (let i = 0; i < N; i++) {
    const d = distArr[i]!;
    if (!(d > 0) || !Number.isFinite(d)) {
      // Origin or NaN distance — pin to shell 0 to keep the index in range.
      // The galaxy still gets counted in cell/shell 0 so pass 4 sees a
      // non-zero divisor and produces weight 1 (cell median == its own
      // count when it's the only entry).
      shellIdxArr[i] = 0;
      const idx0 = cellIdxArr[i]! * N_SHELLS;
      counts[idx0] = (counts[idx0] ?? 0) + 1;
      continue;
    }
    const lr = Math.log10(d / dMin) * invLogSpan;
    let shell = Math.floor(lr * N_SHELLS);
    if (shell < 0) shell = 0;
    if (shell >= N_SHELLS) shell = N_SHELLS - 1;
    shellIdxArr[i] = shell;
    const idx = cellIdxArr[i]! * N_SHELLS + shell;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  // ── Pass 3: median populated count per shell ────────────────────────────
  //
  // For each shell, gather all `count > 0` values across the 12 288 cells
  // and take the median.  The "populated" filter matters: an unpopulated
  // cell at this shell isn't evidence of low density — it's just outside
  // the galaxy catalog's footprint at this shell — so including its 0 would drag
  // the median toward zero and break the correction.
  //
  // Median (not mean) because galaxy catalog footprint edges produce a few cells
  // with hugely-elevated counts; a mean would inflate the reference and
  // make every other cell look under-dense.
  const medianPerShell = new Float32Array(N_SHELLS);
  // Reuse a single scratch buffer for the gather — avoids 10 allocations.
  const scratch = new Float32Array(N_CELLS);
  for (let s = 0; s < N_SHELLS; s++) {
    let len = 0;
    for (let c = 0; c < N_CELLS; c++) {
      const v = counts[c * N_SHELLS + s]!;
      if (v > 0) {
        scratch[len++] = v;
      }
    }
    if (len === 0) {
      medianPerShell[s] = 0;
      continue;
    }
    // In-place sort of the populated subrange.  Float32Array.sort does a
    // numeric sort (unlike Array.sort which is lexicographic by default —
    // a real footgun on dense arrays).
    const view = scratch.subarray(0, len);
    view.sort();
    const mid = len >> 1;
    medianPerShell[s] = len % 2 === 1 ? view[mid]! : (view[mid - 1]! + view[mid]!) / 2;
  }

  // ── Pass 4: per-galaxy weight ────────────────────────────────────────────
  //
  // weight = clamp(medianPerShell[shell] / count[cell, shell], 0.1, 10).
  // The clamp bounds prevent runaway alpha modulation in pathological cells
  // (e.g., a single galaxy-catalog-footprint corner with 1 galaxy in a shell whose
  // median is 200 — a literal 200× boost would saturate the rendering).
  for (let i = 0; i < N; i++) {
    const cell = cellIdxArr[i]!;
    const shell = shellIdxArr[i]!;
    const localCount = counts[cell * N_SHELLS + shell]!;
    const median = medianPerShell[shell]!;
    let w: number;
    if (!(localCount > 0) || !(median > 0)) {
      w = 1;
    } else {
      w = median / localCount;
      if (w < weightMin) w = weightMin;
      else if (w > weightMax) w = weightMax;
    }
    weights[i] = w;
  }

  return weights;
}
