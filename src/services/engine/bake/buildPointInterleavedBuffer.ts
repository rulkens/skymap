/**
 * buildPointInterleavedBuffer — the per-galaxy bake, extracted as a pure
 * function so it can be moved off the main thread.
 *
 * ### Why this lives in its own module
 *
 * For a fully-loaded SDSS + 2MRS + GLADE deck (~3.5 M galaxies total) the
 * bake runs a Schechter integral, a 1/V_max weight, a fallback-orientation
 * hash, a K-correction lookup, and a colour-index pickup *per row* —
 * roughly 10 seconds of CPU work, all of it during `.bin` arrival, right
 * when the user expects the UI to come alive.  Doing that on the main
 * thread would freeze the page, so the bake ships to a Web Worker.  That
 * requires a *pure* function — no `this`, no `device`, no DOM globals, no
 * module-level mutable state — so it can be imported from a Web Worker
 * bundle and run identically off-thread or on.
 *
 * ### Why each upload spawns a fresh worker
 *
 * Structured-clone of a `GalaxyCatalog` with a `BigUint64Array` of object IDs
 * *cannot* be transferred wholesale — the spec only allows ArrayBuffer +
 * ImageBitmap + a few others, and BigInt typed arrays are not on the list.
 * The caller (`pointRenderer.defaultWorkerRunner`) slices each typed
 * array's underlying buffer to produce an owned copy and transfers those
 * slices via `postMessage`'s transfer list — a one-shot ~50 ms memcpy
 * versus a multi-second structured clone of the whole cloud.  See that
 * function's docblock for the full rationale.
 *
 * Spawning a fresh worker per call keeps each bake free of any shared
 * state; parallel galaxy catalog fetches can race-resolve in any order without
 * the worker pool needing per-source coordination — the picker's
 * (sourceCode, localIdx) packing means each galaxy catalog's instance IDs land
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

import { pickColourIndex } from '../../../data/colourIndex';
import { paddedRadiusMpc } from '../../../utils/paddedRadiusMpc';
import { Source } from '../../../data/sources';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../../data/galaxyCatalogFluxLimits';
import { fallbackOrientation } from '../../../utils/random/fallbackOrientation';
import {
  absoluteFromApparent,
  cartesianToRaDec,
  expectedNumberDensity,
  vMaxWeight,
} from '../../../utils/math';
import { computeSchechterRatios } from './computeSchechterRatios';
import type { BuildPointInterleavedBufferMode } from '../../../@types/engine/BuildPointInterleavedBufferMode';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';

/**
 * Number of f32 slots packed per point.  Mirrors `SLOTS_PER_POINT` in
 * `pointRenderer.ts`; the renderer's vertex pipeline declares the matching
 * 48-byte arrayStride.  Kept duplicated rather than imported to avoid
 * `pointRenderer.ts` (which pulls in WebGPU globals via `?raw` shaders) from
 * landing in the worker bundle — the worker should only need pure math.
 *
 * ### Layout
 *
 *   slot 0,1,2 — position xyz (f32)
 *   slot 3     — magnitude (f32)
 *   slot 4     — colorIndex (f32)
 *   slot 5     — axisRatio (f32) — sign bit carries isFallback
 *   slot 6     — positionAngleDeg (f32)
 *   slot 7     — radiusMpc (f32) — padded billboard half-extent
 *   slot 8     — vMaxWeight (f32)
 *   slot 9     — schechterRatio (f32)
 *   slot 10    — angularDensityWeight (f32)
 *
 * Total: 11 × 4 = 44 bytes per point.  Per-galaxy catalog constants stay out of
 * the per-row layout: the K-correction kPerZ lives in the per-galaxy-catalog
 * `SourceUniforms` uniform (k is constant per galaxy catalog, so paying for it
 * per-row would be waste), and instance identity is composed per draw
 * as `(sourceCode << 27) | localIdx + 1` rather than baked per-vertex.
 *
 * The fallback-orientation flag rides on the sign bit of `axisRatio`.
 * Real measurements have axisRatio in (0, 1]; we negate the value when
 * the row was classified as fallback so the shader can recover both the
 * mask shape (`abs(axisRatio)`) and the flag (`axisRatio < 0`) in one
 * read.  See the slot 5 comment in the writer loop below.
 *
 * Slot 10 (`angularDensityWeight`) is left at 1.0 (multiplicative identity)
 * by every default upload.  Mode 4 of the Malmquist-bias correction —
 * HEALPix angular re-weighting — replaces these defaults via the lazy
 * `setBiasMode(BiasMode.AngularReweight)` flow (mirror of Schechter).  Skipping the
 * eager bake here keeps the .bin-arrival latency low: the per-cloud
 * HEALPix pass costs ~100 ms even at full deck, and the user only pays it
 * if they actually pick mode 4.
 */
const SLOTS_PER_POINT = 11;

/** Reference distance used to normalise the per-galaxy 1/V_max weight. */
const D_REF_MPC = 750;

/** Target post-shift mean magnitude for the per-galaxy-catalog magG normalisation. */
const SDSS_TARGET_MEAN_MAG = 18;

/**
 * Bake one point cloud's per-vertex GPU bytes.  Pure: no `this`, no DOM, no
 * module-level state.  Safe to call from a Worker.
 *
 * The per-slot comments in the loop document non-obvious decisions
 * (per-galaxy-catalog magG offset, dim-only Schechter clamp, NaN handling).
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
  // fallback orientation?" rides on the sign bit of `axisRatio` (slot 5) —
  // see that slot's writer below for the encoding.
  const arrayBuffer = new ArrayBuffer(cloud.count * SLOTS_PER_POINT * 4);
  const interleaved = new Float32Array(arrayBuffer);

  // ── Per-galaxy catalog magnitude normalisation ───────────────────────────────────
  //
  // The shader's intensity formula `clamp((22 - mag) / 8, 0.05, 1.0)` is
  // tuned for SDSS-g where the typical apparent magnitude range is 14–22.
  // But our GalaxyCatalog stores `magG` from whichever band the source parser
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
  // Pull the galaxy catalog's apparent-magnitude flux limit once (m_lim) and pick
  // a reference distance for the per-galaxy weight normalisation.  Both
  // are constants over the whole upload, so we hoist them out of the
  // per-galaxy loop.
  const galaxyCatalogMLim = galaxyCatalogFluxLimit(source);

  // ── Schechter LF parameters + central-density normaliser ────────────────
  //
  // Pre-compute the central detectable density `N_ref = n(d = 10 Mpc)` for
  // this galaxy catalog's Schechter triple.  The mode-3 brightness ratio divides
  // this by the per-row density `n(d)` — computed here at bake time, not
  // per-fragment in the shader.
  //
  // We always compute the triple + nRef so the result still carries them
  // back to the renderer (the bookkeeping needs them for cache key purposes
  // even in fast mode).  The expensive step — the per-row N(d) integral —
  // is what we actually skip below.
  const schechter = galaxyCatalogSchechter(source);
  const nRef = expectedNumberDensity({
    ...schechter,
    mLim: galaxyCatalogMLim,
    dMpc: 10,
  });

  // ── Lazy Schechter ratios (mode = 'with-schechter' only) ────────────────
  //
  // When the upload happens while bias mode is already 3, we compute the
  // ratios up-front via the shared helper and splice them into slot 9 of
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
    const [ra, dec] = cartesianToRaDec(x, y, z);
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

    // Distance from origin in Mpc — needed by both the K-correction
    // baked into the colour-index lookup and by the vMaxWeight block
    // below. Hoist once here to avoid a second hypot.
    const dx = cloud.positions[i * 3 + 0]!;
    const dy = cloud.positions[i * 3 + 1]!;
    const dz = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(dx, dy, dz);

    // Apply the per-galaxy-catalog mag offset.  NaN-G galaxies snap to the post-
    // shift target so they render at average intensity instead of vanishing.
    interleaved[o + 3] = Number.isFinite(g) ? g + magOffset : SDSS_TARGET_MEAN_MAG;
    interleaved[o + 4] = pickColourIndex(
      source,
      cloud.magU[i]!,
      cloud.magG[i]!,
      cloud.magR[i]!,
      cloud.magI[i]!,
      cloud.magZ[i]!,
      dMpc,
    );

    // Slot 5 — axisRatio (galaxy disk b/a in (0, 1]) with the SIGN BIT
    // carrying the fallback-orientation flag.  Real measurements from
    // catalogs are always > 0; we negate the value when the row was
    // classified as fallback so the shader can recover both:
    //
    //   - the elliptical mask shape via `abs(axisRatio)`
    //   - the fallback flag via `axisRatio < 0.0`
    //
    // in a single per-instance attribute read.  Float sign-bit packing
    // is well-defined for finite non-zero values and survives NaN
    // (synthetic clouds use NaN axisRatio; the shader's existing
    // `axisRatio > 0` mask correctly treats NaN as "no orientation" →
    // circle, no fallback flag).
    const ab = cloud.axisRatio[i]!;
    interleaved[o + 5] = isFallbackArr[i] === 1 ? -Math.abs(ab) : ab;

    // Slot 6 — positionAngleDeg copied through.
    interleaved[o + 6] = cloud.positionAngleDeg[i]!;

    // Slot 7 — padded billboard radius in Mpc, half-extent (the shader
    // uses it directly as the world-space radius for the billboard
    // quad). Shares the helper with the procedural-disk + textured-
    // thumbnail pipelines so the load-fade handoff occupies an
    // identical world-space footprint across all three.
    interleaved[o + 7] = paddedRadiusMpc(cloud.diameterKpc[i]!);

    // Slot 8 — per-galaxy 1/V_max weight.  Computed from the *raw*
    // apparent magnitude (NOT `g + magOffset` — the per-galaxy-catalog
    // normalisation is a visualisation cosmetic, not a physical change to
    // the photometry) plus Cartesian distance (already hoisted above).
    // vMaxWeight handles NaN inputs by returning 0.
    const absMag = absoluteFromApparent(g, dMpc);
    interleaved[o + 8] = vMaxWeight({
      absMag,
      mLim: galaxyCatalogMLim,
      dRefMpc: D_REF_MPC,
    });

    // Slot 9 — per-galaxy Schechter density-correction ratio.  In fast
    // mode we leave it at the multiplicative identity (1.0); the shader's
    // `select(1.0, schechterRatio, biasMode == 3u)` ignores the slot for
    // modes 0/1/2 anyway, so this matches the rendered output bit-for-bit
    // unless the user actually picks Schechter LF.  When mode ===
    // 'with-schechter' the ratios were computed up-front by
    // `computeSchechterRatios`; we just splice each row in here.
    interleaved[o + 9] = schechterRatios !== null ? schechterRatios[i]! : 1.0;

    // Slot 10 — per-galaxy HEALPix angular re-weight (BiasMode.AngularReweight,
    // mode 4).  Default-write 1.0 (multiplicative identity) so the
    // shader's `select(1.0, angularDensityWeight, biasMode == 4u)`
    // produces no change in the other modes.  The lazy bake path
    // (`pointRenderer.setBiasMode(BiasMode.AngularReweight)`) splices
    // real per-galaxy weights in and re-uploads when the user toggles
    // into mode 4.
    interleaved[o + 10] = 1.0;
  }

  return {
    interleaved,
    isFallbackArr,
    schechter,
    mLim: galaxyCatalogMLim,
    nRef,
  };
}
