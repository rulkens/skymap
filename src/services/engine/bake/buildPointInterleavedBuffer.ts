/**
 * buildPointInterleavedBuffer — the per-galaxy vertex bake, a pure function so
 * it runs identically in the upload worker and in Node tests (no `this`, no
 * DOM, no module state). ~3.5 M rows of colour-index, PA and SB work would
 * freeze the main thread on `.bin` arrival, hence the worker; the caller
 * (`catalogStore`'s `defaultWorkerRunner`) slice-copies the cloud and transfers
 * the copies. The record layout must match `galaxyPointVertexLayout.ts`
 * byte-for-byte — changing one side alone corrupts every billboard.
 */

import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { paddedRadiusMpc } from '../../../utils/paddedRadiusMpc';
import { absoluteFromApparent } from '../../../utils/math';
import { decodeAngularWeight } from '../../../utils/galaxy/decodeAngularWeight';
import { galaxySbAmp } from '../../../utils/galaxy/galaxySbAmp';
import { galaxyMedianAbsMag } from '../../../utils/galaxy/galaxyMedianAbsMag';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';

/**
 * f32 slots per point — duplicated from `galaxyPointVertexLayout.ts` rather
 * than imported, so the worker bundle never pulls in the renderer's WebGPU
 * and `?static` shader imports.
 *
 *   0-2 xyz · 3 magnitude · 4 colorIndex · 5 axisRatio (sign = isFallback) ·
 *   6-7 paCos, paSin · 8 radiusMpc (sign = diameterIsFallback) ·
 *   9 angularWeight · 10 absMag · 11 sbAmp
 *
 * Slots 6/7 and 10 are galaxy-static values baked here so the vertex shader
 * does not spend a cos+sin and a log10+sqrt per invocation every frame.
 */
const SLOTS_PER_GALAXY_POINT = 12;

/** Target post-shift mean magnitude for the per-galaxy-catalog magG normalisation. */
const SDSS_TARGET_MEAN_MAG = 18;

/** Bake one point cloud's per-vertex GPU bytes. */
export function buildPointInterleavedBuffer(
  input: BuildPointInterleavedBufferInput,
): BuildPointInterleavedBufferResult {
  const { cloud, source } = input;

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
  // `cloud.medianAbsMag` when the catalog carries one (the decode path
  // always populates it); recomputed here as a
  // fallback for lightweight test fixtures that omit the optional field.
  const medianAbsMag = cloud.medianAbsMag ?? galaxyMedianAbsMag(cloud);

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

    // Distance from origin in Mpc — the colour-index K-correction and both
    // absolute magnitudes below read it.
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
    // (the format's NaN "no measurement" sentinel included; the shader's
    // existing `axisRatio > 0` mask correctly treats NaN as "no
    // orientation" → circle, no fallback flag).
    const ab = cloud.axisRatio[i]!;
    interleaved[o + 5] = isFallbackArr[i] === 1 ? -Math.abs(ab) : ab;

    // Slots 6/7 — cos/sin of the position-angle rotation, negation folded
    // in.  Astronomical PA is east-of-north (CCW on sky) but UV-space y
    // points down on screen, and rotating the UV is the inverse of
    // rotating the ellipse — hence the minus sign, identical to what the
    // vertex shader used to apply before calling cos/sin per vertex.
    // A NaN PA bakes to NaN cos/sin, matching the shader-computed values
    // for those rows bit-for-bit.
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

    // Slot 9 — the build-time angular weight; raw 0 (never baked) decodes to 1.
    interleaved[o + 9] = decodeAngularWeight(cloud.angularWeight[i]!);

    // Slot 10 — absolute magnitude for the Malmquist mode-1 gate,
    // computed from the OFFSET-normalised slot-3 magnitude — NOT the raw
    // `g` slot 11 uses.  The shader's gate historically ran
    // 'distanceModulus(p.magnitude, length(p.position))' where p.magnitude
    // is slot 3, so the baked value must fold the same per-catalog mean
    // shift or every mode-1 threshold would move by `magOffset`.
    interleaved[o + 10] = interleaved[o + 3]! - 5 * Math.log10(dMpc) - 25;

    // Slot 11 — physical surface-brightness amplitude. Relative luminosity
    // (vs the per-catalog mean absolute magnitude) over (diameter / 30 kpc)^2.
    // This is the intrinsic per-pixel radiance the vertex stage scales into
    // HDR: intrinsically bright / compact galaxies emit above the bloom
    // threshold; diffuse ones stay dim. Uses the RAW physical absMag, not the
    // cosmetic offset-normalised slot-3/slot-10 value. The
    // procedural-disk pass (`proceduralDiskSubsystem.ts`) recomputes this
    // SAME amplitude via the shared `galaxySbAmp` helper so the point↔disk
    // crossfade holds constant brightness.
    const absMag = absoluteFromApparent(g, dMpc);
    interleaved[o + 11] = galaxySbAmp(absMag, medianAbsMag, cloud.diameterKpc[i]!);
  }

  return { interleaved, isFallbackArr };
}
