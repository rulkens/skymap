/**
 * buildPointInterleavedBuffer — the per-galaxy bake, extracted as a pure
 * function so it can be moved off the main thread.
 *
 * ### Why this lives in its own module
 *
 * Until 2026-05-04 the bake happened inline inside `pointRenderer.upload()`.
 * For a fully-loaded SDSS + 2MRS + GLADE deck (~3.5 M galaxies total) that
 * loop ran a Schechter integral, a 1/V_max weight, a fallback-orientation
 * hash, a K-correction lookup, and a colour-index pickup *per row*.  Total
 * cost ≈ 10 seconds of main-thread work, all of it spent during `.bin`
 * arrival — the UI froze right when the user expected it to come alive.
 *
 * The fix was structural, not algorithmic: move the same code off the main
 * thread.  To do that cleanly we needed a *pure* function — no `this`, no
 * `device`, no DOM globals, no module-level mutable state — so it can be
 * imported from a Web Worker bundle and run identically off-thread or on.
 *
 * Visual output is bit-identical to the inline version: same magnitudes get
 * baked, same colour indices, same K coefficients, same vMax weights, same
 * Schechter ratios.  Only the thread changed.
 *
 * ### Why each upload spawns a fresh worker
 *
 * Structured-clone of a `PointCloud` with a `BigUint64Array` of object IDs
 * *cannot* be transferred wholesale — the spec only allows ArrayBuffer +
 * ImageBitmap + a few others, and BigInt typed arrays are not on the list.
 * The caller (`pointRenderer.defaultWorkerRunner`) slices each typed
 * array's underlying buffer to produce an owned copy and transfers those
 * slices via `postMessage`'s transfer list — a one-shot ~50 ms memcpy
 * versus a multi-second structured clone of the whole cloud.  See that
 * function's docblock for the full rationale.
 *
 * Spawning a fresh worker per call keeps each bake free of any shared
 * state; parallel survey fetches can race-resolve in any order without
 * the worker pool needing per-source coordination — the picker's
 * (sourceCode, localIdx) packing means each survey's instance IDs land
 * in a structurally-disjoint range without any global running-sum bake.
 *
 * ### Layout invariants
 *
 * The `interleaved` Float32Array MUST match the byte layout described in
 * `pointRenderer.ts`'s `SLOTS_PER_POINT` doc.  Slot indices used here are
 * the same offsets the GPU vertex pipeline reads.  Changing either side
 * without the other corrupts every billboard.
 *
 * @module
 */

import type { PointCloud } from '../../@types';
import { pickColourIndex } from '../../data/colourIndex';
import { Source } from '../../data/sources';
import {
  surveyFluxLimit,
  surveySchechter,
  type SchechterTriple,
} from '../../data/surveyFluxLimits';
import { fallbackOrientation } from '../../utils/random/fallbackOrientation';
import {
  absoluteFromApparent,
  cartesianToRaDecZ,
  expectedNumberDensity,
  vMaxWeight,
} from '../../utils/math';
import { computeSchechterRatios } from './computeSchechterRatios';

/**
 * Number of f32 slots packed per point.  Mirrors `SLOTS_PER_POINT` in
 * `pointRenderer.ts`; the renderer's vertex pipeline declares the matching
 * 48-byte arrayStride.  Kept duplicated rather than imported to avoid
 * `pointRenderer.ts` (which pulls in WebGPU globals via `?raw` shaders) from
 * landing in the worker bundle — the worker should only need pure math.
 *
 * ### Layout (post (source, localIdx) packing refactor)
 *
 *   slot 0,1,2 — position xyz (f32)
 *   slot 3     — magnitude (f32)
 *   slot 4     — colorIndex (f32)
 *   slot 5     — kPerZ (f32)
 *   slot 6     — axisRatio (f32) — sign bit carries isFallback
 *   slot 7     — positionAngleDeg (f32)
 *   slot 8     — diameterKpc (f32)
 *   slot 9     — vMaxWeight (f32)
 *   slot 10    — schechterRatio (f32)
 *   slot 11    — angularDensityWeight (f32)
 *
 * Total: 12 × 4 = 48 bytes per point (down from 52).  The previous
 * `globalInstanceIdx u32` slot is gone — the picker now writes
 * `(sourceCode << 27) | localIdx + 1` directly via a per-draw uniform
 * carrying the source code and the GPU's `@builtin(instance_index)` for
 * the local index.  No more priorCount running-sum bake.
 *
 * The fallback-orientation flag (formerly the high bit of
 * `globalInstanceIdx`) now rides on the sign bit of `axisRatio`.  Real
 * measurements have axisRatio in (0, 1]; we negate the value when the
 * row was classified as fallback so the shader can recover both the
 * mask shape (`abs(axisRatio)`) and the flag (`axisRatio < 0`) in one
 * read.  See the slot 6 comment in the writer loop below.
 *
 * Slot 11 (`angularDensityWeight`) is left at 1.0 (multiplicative identity)
 * by every default upload.  Mode 4 of the Malmquist-bias correction —
 * HEALPix angular re-weighting — replaces these defaults via the lazy
 * `setBiasMode(BiasMode.AngularReweight)` flow (mirror of Schechter).  Skipping the
 * eager bake here keeps the .bin-arrival latency low: the per-cloud
 * HEALPix pass costs ~100 ms even at full deck, and the user only pays it
 * if they actually pick mode 4.
 */
const SLOTS_PER_POINT = 12;

/** Reference distance used to normalise the per-galaxy 1/V_max weight. */
const D_REF_MPC = 750;

/** Target post-shift mean magnitude for the per-survey magG normalisation. */
const SDSS_TARGET_MEAN_MAG = 18;

/**
 * Sentinel value the WGSL fragment shader recognises as "no measured colour
 * for this row".  Mirrors the one in `pointRenderer.ts`.
 */
const NO_COLOUR_SENTINEL = 999;

/**
 * Two-mode flag selecting whether the bake computes per-galaxy Schechter
 * ratios eagerly (~700 M math ops at full deck) or leaves slot 10 at the
 * multiplicative identity (1.0).
 *
 *   - `'fast'`            — slot 10 = 1.0 for every row.  The shader's
 *                           `select(1.0, schechterRatio, biasMode == 3u)`
 *                           gate ignores the slot when bias mode isn't 3,
 *                           so this is correct AS LONG AS the user hasn't
 *                           picked Schechter LF.  This is the default at
 *                           upload time — the .bin lands fast (~2 s saved
 *                           on a fully-loaded deck).
 *   - `'with-schechter'`  — slot 10 holds the real `min(1, sqrt(nRef/n(d)))`
 *                           ratio, computed via `computeSchechterRatios`.
 *                           Used either when an upload happens *while*
 *                           Schechter mode is already active, or as part
 *                           of the lazy `setBiasMode(BiasMode.Schechter)`
 *                           re-bake.
 *
 * Why a flag rather than always doing the work?  The integral is the single
 * largest cost in the upload bake — collapsing it to "fill with 1.0" cuts
 * the bake's main-thread time by roughly two-thirds when the user is on the
 * default bias mode.  See the per-vertex `schechterRatio` doc in
 * `pointRenderer.ts` for the full design notes.
 */
export type BuildPointInterleavedBufferMode = 'fast' | 'with-schechter';

export type BuildPointInterleavedBufferInput = {
  /** The point cloud to bake.  Travels by structured clone (see module doc). */
  cloud: PointCloud;
  /** Which survey this cloud belongs to — drives flux limit, Schechter triple, etc. */
  source: Source;
  /**
   * Whether to compute the per-galaxy Schechter ratios as part of this bake.
   * Defaults to `'fast'` (slot 10 = 1.0).  See `BuildPointInterleavedBufferMode`
   * for the trade-off.  Optional so existing callers (and the worker
   * structured-clone roundtrip) keep working without recompilation.
   */
  mode?: BuildPointInterleavedBufferMode;
};

/**
 * Output of the bake.  The renderer copies `interleaved` into the GPU
 * vertex buffer and stashes the rest on the per-source bookkeeping so
 * `draw()` can populate the global uniform without redoing the integral.
 */
export type BuildPointInterleavedBufferResult = {
  /** Interleaved per-vertex bytes — see `SLOTS_PER_POINT` in pointRenderer.ts. */
  interleaved: Float32Array;
  /**
   * Parallel per-row flag set when the row's (axisRatio, positionAngleDeg)
   * exactly equals the deterministic fallback for that row.  Used inside
   * the bake to encode the fallback flag into the sign bit of axisRatio
   * (slot 6); also exposed so callers and tests can assert which rows the
   * bake classified as fallback without re-running the hash.
   */
  isFallbackArr: Uint8Array;
  /** Schechter LF triple `(M*, α, φ*)` for this survey's selection band. */
  schechter: SchechterTriple;
  /** Survey apparent-magnitude flux limit (e.g. SDSS = 17.77). */
  mLim: number;
  /** Pre-computed central-density normaliser N_ref = n(d = 10 Mpc). */
  nRef: number;
};

/**
 * Bake one point cloud's per-vertex GPU bytes.  Pure: no `this`, no DOM, no
 * module-level state.  Safe to call from a Worker.
 *
 * The body is a near-verbatim lift of the loop that used to live inside
 * `pointRenderer.upload()`; the inline-version comments have been preserved
 * because they document non-obvious decisions (per-survey magG offset,
 * dim-only Schechter clamp, NaN handling).  Modify both sides if you change
 * one.
 */
export function buildPointInterleavedBuffer(
  input: BuildPointInterleavedBufferInput,
): BuildPointInterleavedBufferResult {
  const { cloud, source } = input;
  // Default to fast mode — the upload path almost always wants this, and the
  // worker's structured-clone roundtrip serialises `undefined` to `undefined`
  // so the explicit fallback keeps the behaviour predictable across both
  // call paths.  See `BuildPointInterleavedBufferMode` for the trade-off.
  const mode: BuildPointInterleavedBufferMode = input.mode ?? 'fast';

  // Allocate a CPU-side ArrayBuffer for the interleaved data.  Every slot is
  // an f32 from the GPU's perspective; the single bit of "is this row a
  // fallback orientation?" rides on the sign bit of `axisRatio` (slot 6) —
  // see that slot's writer below for the encoding.
  const arrayBuffer = new ArrayBuffer(cloud.count * SLOTS_PER_POINT * 4);
  const interleaved = new Float32Array(arrayBuffer);

  // ── Per-survey magnitude normalisation ───────────────────────────────────
  //
  // The shader's intensity formula `clamp((22 - mag) / 8, 0.05, 1.0)` is
  // tuned for SDSS-g where the typical apparent magnitude range is 14–22.
  // But our PointCloud stores `magG` from whichever band the source parser
  // put there:
  //
  //   - SDSS  → real g-band  (range ~14–22)
  //   - 2MRS  → J-band       (range ~4–15)   — much brighter numbers
  //   - GLADE → B-band       (range ~7–20)
  //
  // Without normalisation, 2MRS J=5 maps to (22-5)/8 = 2.1 → clamps to 1.0,
  // and most 2MRS galaxies render at maximum intensity with zero contrast.
  let magSum = 0;
  let magCount = 0;
  for (let i = 0; i < cloud.count; i++) {
    const m = cloud.magG[i]!;
    if (Number.isFinite(m)) {
      magSum += m;
      magCount++;
    }
  }
  const sourceMean = magCount > 0 ? magSum / magCount : SDSS_TARGET_MEAN_MAG;
  const magOffset = SDSS_TARGET_MEAN_MAG - sourceMean;

  // ── Malmquist 1/V_max weight inputs ──────────────────────────────────────
  //
  // Pull the survey's apparent-magnitude flux limit once (m_lim) and pick
  // a reference distance for the per-galaxy weight normalisation.  Both
  // are constants over the whole upload, so we hoist them out of the
  // per-galaxy loop.
  const surveyMLim = surveyFluxLimit(source);

  // ── Schechter LF parameters + central-density normaliser ────────────────
  //
  // Pre-compute the central detectable density `N_ref = n(d = 10 Mpc)` for
  // this survey's Schechter triple.  The shader's mode-3 alpha modulator
  // divides this by the per-fragment density `n(d)` to compute the
  // brightness ratio — but in this post-bake refactor the division now
  // happens per-row right here.
  //
  // We always compute the triple + nRef so the result still carries them
  // back to the renderer (the bookkeeping needs them for cache key purposes
  // even in fast mode).  The expensive step — the per-row N(d) integral —
  // is what we actually skip below.
  const schechter = surveySchechter(source);
  const nRef = expectedNumberDensity({
    ...schechter,
    mLim: surveyMLim,
    dMpc: 10,
  });

  // ── Lazy Schechter ratios (mode = 'with-schechter' only) ────────────────
  //
  // When the upload happens while bias mode is already 3, we compute the
  // ratios up-front via the shared helper and splice them into slot 11 of
  // each row below.  Otherwise (the common case) every row gets 1.0.
  //
  // Calling the helper here — rather than open-coding the integral — keeps
  // the math single-source-of-truth between this path and the lazy
  // `setBiasMode(BiasMode.Schechter)` re-bake path.  The shared helper traverses the
  // cloud once with the same hoisted constants (mLim, schechter triple),
  // so there's no measurable overhead vs the inline version.
  const schechterRatios: Float32Array | null =
    mode === 'with-schechter' ? computeSchechterRatios({ cloud, source }) : null;

  // ── Pre-compute "is this row a fallback orientation?" flag ─────────────
  //
  // Done once at upload time (not per-frame); cost is the same hash +
  // Float32 round-trip we'd pay anyway in the InfoCard.  The build pipeline
  // stamped the SAME f32 we recompute here whenever a galaxy lacks real
  // orientation, so equality is exact (no epsilon needed).
  const isFallbackArr = new Uint8Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.positions[i * 3 + 0]!;
    const y = cloud.positions[i * 3 + 1]!;
    const z = cloud.positions[i * 3 + 2]!;
    const [ra, dec] = cartesianToRaDecZ(x, y, z);
    const fb = fallbackOrientation(cloud.objIDs[i]!, ra, dec);
    const fbAr = new Float32Array([fb.axisRatio])[0]!;
    const fbPa = new Float32Array([fb.positionAngleDeg])[0]!;
    if (cloud.axisRatio[i] === fbAr && cloud.positionAngleDeg[i] === fbPa) {
      isFallbackArr[i] = 1;
    }
  }

  for (let i = 0; i < cloud.count; i++) {
    const o = i * SLOTS_PER_POINT;

    // Copy the three position components from the SoA positions array.
    interleaved[o + 0] = cloud.positions[i * 3 + 0]!;
    interleaved[o + 1] = cloud.positions[i * 3 + 1]!;
    interleaved[o + 2] = cloud.positions[i * 3 + 2]!;

    const g = cloud.magG[i]!;

    const colour = pickColourIndex(
      source,
      cloud.magU[i]!,
      cloud.magG[i]!,
      cloud.magR[i]!,
      cloud.magI[i]!,
      cloud.magZ[i]!,
    );

    // Apply the per-survey mag offset.  NaN-G galaxies snap to the post-
    // shift target so they render at average intensity instead of vanishing.
    interleaved[o + 3] = Number.isFinite(g) ? g + magOffset : SDSS_TARGET_MEAN_MAG;
    interleaved[o + 4] = colour ? colour.colourIndex : NO_COLOUR_SENTINEL;

    // Slot 5 — per-row K-correction coefficient.  See pickColourIndex.
    interleaved[o + 5] = colour ? colour.kPerZ : 0;

    // Slot 6 — axisRatio (galaxy disk b/a in (0, 1]) with the SIGN BIT
    // carrying the fallback-orientation flag.  Real measurements from
    // catalogs are always > 0; we negate the value when the row was
    // classified as fallback so the shader can recover both:
    //
    //   - the elliptical mask shape via `abs(axisRatio)`
    //   - the fallback flag via `axisRatio < 0.0`
    //
    // in a single per-instance attribute read.  This replaces the prior
    // high-bit-of-globalInstanceIdx encoding — that piggyback went away
    // with the (source, localIdx) packing refactor that deleted the
    // globalInstanceIdx slot entirely.  Float sign-bit packing is well-
    // defined for finite non-zero values and survives NaN (synthetic
    // clouds use NaN axisRatio; the shader's existing `axisRatio > 0`
    // mask correctly treats NaN as "no orientation" → circle, no
    // fallback flag).
    const ab = cloud.axisRatio[i]!;
    interleaved[o + 6] = isFallbackArr[i] === 1 ? -Math.abs(ab) : ab;

    // Slots 7..8 — positionAngleDeg + diameterKpc copied through.  Build
    // pipeline guarantees finite values for diameterKpc; positionAngleDeg
    // is real-or-fallback (also finite).
    interleaved[o + 7] = cloud.positionAngleDeg[i]!;
    interleaved[o + 8] = cloud.diameterKpc[i]!;

    // Slot 9 — per-galaxy 1/V_max weight.  Computed from the *raw*
    // apparent magnitude (NOT `g + magOffset` — the per-survey
    // normalisation is a visualisation cosmetic, not a physical change to
    // the photometry) plus Cartesian distance.  vMaxWeight handles NaN
    // inputs by returning 0.
    const dx = cloud.positions[i * 3 + 0]!;
    const dy = cloud.positions[i * 3 + 1]!;
    const dz = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(dx, dy, dz);
    const absMag = absoluteFromApparent(g, dMpc);
    interleaved[o + 9] = vMaxWeight({
      absMag,
      mLim: surveyMLim,
      dRefMpc: D_REF_MPC,
    });

    // Slot 10 — per-galaxy Schechter density-correction ratio.  In fast
    // mode we leave it at the multiplicative identity (1.0); the shader's
    // `select(1.0, schechterRatio, biasMode == 3u)` ignores the slot for
    // modes 0/1/2 anyway, so this matches the rendered output bit-for-bit
    // unless the user actually picks Schechter LF.
    //
    // When mode === 'with-schechter' the ratios were computed up-front by
    // `computeSchechterRatios` (above); we just splice each row in here.
    interleaved[o + 10] = schechterRatios !== null ? schechterRatios[i]! : 1.0;

    // Slot 11 — per-galaxy HEALPix angular re-weight (BiasMode.AngularReweight,
    // mode 4 of the Malmquist-bias correction).  Default-write 1.0 (the
    // multiplicative identity) so the shader's
    // `select(1.0, angularDensityWeight, biasMode == 4u)` produces no change
    // in the other four modes.  The lazy bake path
    // (`pointRenderer.setBiasMode(BiasMode.AngularReweight)`) splices real
    // per-galaxy weights into this slot and re-uploads when the user toggles
    // into mode 4.  We don't add an eager `'with-angular'` mode here because
    // the toggle isn't expected to be the default; if a survey arrives
    // mid-mode-4 the renderer's `setBiasMode` re-runs the worker bake for
    // the new source, picking up the now-stale 1.0s.
    interleaved[o + 11] = 1.0;
  }

  return {
    interleaved,
    isFallbackArr,
    schechter,
    mLim: surveyMLim,
    nRef,
  };
}

