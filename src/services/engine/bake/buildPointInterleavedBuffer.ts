/**
 * buildPointInterleavedBuffer — the per-galaxy bake, extracted as a pure
 * function so it can be moved off the main thread.
 *
 * ### Why this lives in its own module
 *
 * For a fully-loaded SDSS + 2MRS + GLADE deck (~3.5 M galaxies total) the
 * bake runs a Schechter integral, a 1/V_max weight, a K-correction lookup,
 * and a colour-index pickup *per row* — roughly 10 seconds of CPU work, all
 * of it during `.bin` arrival, right
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
 * The caller (`galaxyPointRenderer.defaultWorkerRunner`) slices each typed
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
 * `galaxyPointRenderer.ts`'s `SLOTS_PER_GALAXY_POINT` doc.  Slot indices used here are
 * the same offsets the GPU vertex pipeline reads.  Changing either side
 * without the other corrupts every billboard.
 *
 * @module
 */

import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { paddedRadiusMpc } from '../../../utils/paddedRadiusMpc';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../../data/galaxyCatalog/galaxyCatalogFluxLimits';
import { absoluteFromApparent, expectedNumberDensity, vMaxWeight } from '../../../utils/math';
import { computeSchechterRatios } from './computeSchechterRatios';
import { galaxySbAmp } from '../../../utils/galaxy/galaxySbAmp';
import { galaxyMedianAbsMag } from '../../../utils/galaxy/galaxyMedianAbsMag';
import type { BuildPointInterleavedBufferMode } from '../../../@types/engine/BuildPointInterleavedBufferMode';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';

/**
 * Number of f32 slots packed per point.  Mirrors `SLOTS_PER_GALAXY_POINT` in
 * `galaxyPointRenderer.ts`; the renderer's vertex pipeline declares the matching
 * 48-byte arrayStride.  Kept duplicated rather than imported to avoid
 * `galaxyPointRenderer.ts` (which pulls in WebGPU globals via `?raw` shaders) from
 * landing in the worker bundle — the worker should only need pure math.
 *
 * ### Layout
 *
 *   slot 0,1,2 — position xyz (f32)
 *   slot 3     — magnitude (f32)
 *   slot 4     — colorIndex (f32)
 *   slot 5     — axisRatio (f32) — sign bit carries isFallback
 *   slot 6,7   — paCos, paSin (f32×2) — cos/sin of the negated position angle
 *   slot 8     — radiusMpc (f32) — padded billboard half-extent; sign bit carries diameterIsFallback
 *   slot 9     — vMaxWeight (f32)
 *   slot 10    — schechterRatio (f32)
 *   slot 11    — angularDensityWeight (f32)
 *   slot 12    — absMag (f32) — from the offset-normalised slot-3 magnitude
 *   slot 13    — sbAmp (f32) — physical surface-brightness amplitude
 *
 * Total: 14 × 4 = 56 bytes per point.  Per-galaxy catalog constants stay out of
 * the per-row layout: the K-correction kPerZ lives in the per-galaxy-catalog
 * `SourceUniforms` uniform (k is constant per galaxy catalog, so paying for it
 * per-row would be waste), and instance identity is composed per draw
 * as `(sourceCode << 26) | localIdx + 1` rather than baked per-vertex.
 *
 * The fallback-orientation flag rides on the sign bit of `axisRatio`.
 * Real measurements have axisRatio in (0, 1]; we negate the value when
 * the row was classified as fallback so the shader can recover both the
 * mask shape (`abs(axisRatio)`) and the flag (`axisRatio < 0`) in one
 * read.  See the slot 5 comment in the writer loop below.
 *
 * The fallback-diameter flag rides the same way on the sign bit of
 * `radiusMpc` (slot 8).  The padded radius is always positive, so we
 * negate it when `diameterIsFallback` is set; the shader recovers the
 * magnitude via `abs()` and the flag via `< 0`.  See the slot 8 comment
 * in the writer loop below.
 *
 * Slot 11 (`angularDensityWeight`) is left at 1.0 (multiplicative identity)
 * by every default upload.  Mode 4 of the Malmquist-bias correction —
 * HEALPix angular re-weighting — replaces these defaults via the lazy
 * `setBiasMode(BiasMode.AngularReweight)` flow (mirror of Schechter).  Skipping the
 * eager bake here keeps the .bin-arrival latency low: the per-cloud
 * HEALPix pass costs ~100 ms even at full deck, and the user only pays it
 * if they actually pick mode 4.
 *
 * Slots 6/7 (paCosSin) and 12 (absMag) exist so the vertex shader never
 * recomputes galaxy-static values: the PA rotation and the absolute
 * magnitude are properties of the row, not the frame, yet the shader used
 * to spend a cos+sin and a log10+sqrt on them for all 6 vertices of every
 * instance every frame (~15 M invocations at the large tier).  Baking them
 * once here is the classic space-for-ALU trade — +8 bytes/row against the
 * hottest per-frame loop in the app.
 */
const SLOTS_PER_GALAXY_POINT = 14;

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
  const arrayBuffer = new ArrayBuffer(cloud.count * SLOTS_PER_GALAXY_POINT * 4);
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

  // Surface-brightness zero-point — a DIFFERENT quantity from the magOffset
  // above (that one is a cosmetic per-catalog display shift; this one is
  // the physical median absolute magnitude `galaxySbAmp` normalises
  // against). Shared with the disk-planner mirror of this bake via
  // `cloud.medianAbsMag` when the catalog carries one (the real
  // decode/synthetic paths always populate it); recomputed here as a
  // fallback for lightweight test fixtures that omit the optional field.
  const medianAbsMag = cloud.medianAbsMag ?? galaxyMedianAbsMag(cloud);

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

  // ── "Is this row a fallback orientation?" flag ─────────────────────────
  //
  // Read straight off the cloud's persisted `orientationIsFallback` byte —
  // the AUTHORITATIVE flag `recordsToCloud` stamped at build time and the
  // .bin carried through verbatim.  The old code reconstructed this here by
  // re-hashing `fallbackOrientation` from the baked f32 position and testing
  // float equality; that round-trip is lossy (f32 cartesian → ra/dec → hash
  // bucketed at Math.round(ra·1e5)) and silently misclassified ~10 % of
  // fallback rows.  We `.slice()` to own a fresh buffer the worker can
  // transfer back without detaching the caller's cloud.
  const isFallbackArr = cloud.orientationIsFallback.slice();

  for (let i = 0; i < cloud.count; i++) {
    const o = i * SLOTS_PER_GALAXY_POINT;

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

    // Slots 6/7 — cos/sin of the position-angle rotation, negation folded
    // in.  Astronomical PA is east-of-north (CCW on sky) but UV-space y
    // points down on screen, and rotating the UV is the inverse of
    // rotating the ellipse — hence the minus sign, identical to what the
    // vertex shader used to apply before calling cos/sin per vertex.
    // NaN PA (synthetic clouds) bakes to NaN cos/sin, matching the
    // shader-computed values for those rows bit-for-bit.
    const paRad = (-cloud.positionAngleDeg[i]! * Math.PI) / 180;
    interleaved[o + 6] = Math.cos(paRad);
    interleaved[o + 7] = Math.sin(paRad);

    // Slot 8 — padded billboard radius in Mpc, half-extent (the shader
    // uses it directly as the world-space radius for the billboard
    // quad). Shares the helper with the procedural-disk + textured-
    // thumbnail pipelines so the load-fade handoff occupies an
    // identical world-space footprint across all three.
    //
    // The SIGN BIT carries the fallback-diameter flag, exactly like slot
    // 5's axisRatio carries the fallback-orientation flag. The padded
    // radius is always positive, so we negate it when the row's diameter
    // was a fallback estimate; the shader recovers the magnitude via
    // `abs()` and the flag via `< 0`.
    const padded = paddedRadiusMpc(cloud.diameterKpc[i]!);
    interleaved[o + 8] = cloud.diameterIsFallback[i] === 1 ? -padded : padded;

    // Slot 9 — per-galaxy 1/V_max weight.  Computed from the *raw*
    // apparent magnitude (NOT `g + magOffset` — the per-galaxy-catalog
    // normalisation is a visualisation cosmetic, not a physical change to
    // the photometry) plus Cartesian distance (already hoisted above).
    // vMaxWeight handles NaN inputs by returning 0.
    const absMag = absoluteFromApparent(g, dMpc);
    interleaved[o + 9] = vMaxWeight({
      absMag,
      mLim: galaxyCatalogMLim,
      dRefMpc: D_REF_MPC,
    });

    // Slot 10 — per-galaxy Schechter density-correction ratio.  In fast
    // mode we leave it at the multiplicative identity (1.0); the shader's
    // `select(1.0, schechterRatio, biasMode == 3u)` ignores the slot for
    // modes 0/1/2 anyway, so this matches the rendered output bit-for-bit
    // unless the user actually picks Schechter LF.  When mode ===
    // 'with-schechter' the ratios were computed up-front by
    // `computeSchechterRatios`; we just splice each row in here.
    interleaved[o + 10] = schechterRatios !== null ? schechterRatios[i]! : 1.0;

    // Slot 11 — per-galaxy HEALPix angular re-weight (BiasMode.AngularReweight,
    // mode 4).  Default-write 1.0 (multiplicative identity) so the
    // shader's `select(1.0, angularDensityWeight, biasMode == 4u)`
    // produces no change in the other modes.  The lazy bake path
    // (`galaxyPointRenderer.setBiasMode(BiasMode.AngularReweight)`) splices
    // real per-galaxy weights in and re-uploads when the user toggles
    // into mode 4.
    interleaved[o + 11] = 1.0;

    // Slot 12 — absolute magnitude for the Malmquist mode-1 gate,
    // computed from the OFFSET-normalised slot-3 magnitude — NOT the raw
    // `g` the vMaxWeight above uses.  The shader's gate historically ran
    // 'distanceModulus(p.magnitude, length(p.position))' where p.magnitude
    // is slot 3, so the baked value must fold the same per-catalog mean
    // shift or every mode-1 threshold would move by `magOffset`.
    interleaved[o + 12] = interleaved[o + 3]! - 5 * Math.log10(dMpc) - 25;

    // Slot 13 — physical surface-brightness amplitude. Relative luminosity
    // (vs the per-catalog mean absolute magnitude) over (diameter / 30 kpc)^2.
    // This is the intrinsic per-pixel radiance the vertex stage scales into
    // HDR: intrinsically bright / compact galaxies emit above the bloom
    // threshold; diffuse ones stay dim. Uses the RAW physical absMag (same as
    // vMax), not the cosmetic offset-normalised slot-3/slot-12 value. The
    // procedural-disk pass (`proceduralDiskSubsystem.ts`) recomputes this
    // SAME amplitude via the shared `galaxySbAmp` helper so the point↔disk
    // crossfade holds constant brightness.
    interleaved[o + 13] = galaxySbAmp(absMag, medianAbsMag, cloud.diameterKpc[i]!);
  }

  return {
    interleaved,
    isFallbackArr,
    schechter,
    mLim: galaxyCatalogMLim,
    nRef,
  };
}
