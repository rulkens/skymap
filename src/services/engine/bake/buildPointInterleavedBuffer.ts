/**
 * buildPointInterleavedBuffer — the per-galaxy vertex bake, pure so it runs
 * alike in the upload worker (`catalogStore`'s `defaultWorkerRunner`; ~3.5 M
 * rows would freeze the main thread) and in Node tests. The record must match
 * `galaxyPointVertexLayout.ts` byte-for-byte — one side alone corrupts every billboard.
 */

import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { paddedRadiusMpc } from '../../../utils/paddedRadiusMpc';
import { absoluteFromApparent } from '../../../utils/math/absoluteFromApparent';
import { decodeAngularWeight } from '../../../utils/galaxy/decodeAngularWeight';
import { galaxySbAmp } from '../../../utils/galaxy/galaxySbAmp';
import { galaxyMedianAbsMag } from '../../../utils/galaxy/galaxyMedianAbsMag';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';

/**
 * f32 slots per point, duplicated from `galaxyPointVertexLayout.ts` so the
 * worker bundle never pulls in WebGPU and `?static` shader imports:
 * 0-2 xyz · 3 magnitude · 4 colorIndex · 5 axisRatio (sign = isFallback) ·
 * 6-7 paCos, paSin · 8 radiusMpc (sign = diameterIsFallback) ·
 * 9 angularWeight · 10 absMag · 11 sbAmp
 */
const SLOTS_PER_GALAXY_POINT = 12;

/** Post-shift mean magnitude: the shader's `clamp((22 - mag) / 8, …)` is tuned for SDSS-g (~14–22). */
const SDSS_TARGET_MEAN_MAG = 18;

export function buildPointInterleavedBuffer(
  input: BuildPointInterleavedBufferInput,
): BuildPointInterleavedBufferResult {
  const { cloud, source } = input;
  const arrayBuffer = new ArrayBuffer(cloud.count * SLOTS_PER_GALAXY_POINT * 4);
  const interleaved = new Float32Array(arrayBuffer);

  // magG holds whichever band the parser stored (2MRS J ~4–15, GLADE B ~7–20);
  // unshifted, 2MRS would clamp to full intensity with zero contrast.
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

  // The physical median absolute magnitude `galaxySbAmp` normalises against,
  // not magOffset's cosmetic shift; recomputed only for fixtures lacking it.
  const medianAbsMag = cloud.medianAbsMag ?? galaxyMedianAbsMag(cloud);

  // Sliced so the worker can transfer it without detaching the caller's cloud.
  const isFallbackArr = cloud.orientationIsFallback.slice();

  for (let i = 0; i < cloud.count; i++) {
    const o = i * SLOTS_PER_GALAXY_POINT;
    interleaved[o + 0] = cloud.positions[i * 3 + 0]!;
    interleaved[o + 1] = cloud.positions[i * 3 + 1]!;
    interleaved[o + 2] = cloud.positions[i * 3 + 2]!;

    const g = cloud.magG[i]!;
    const dx = cloud.positions[i * 3 + 0]!;
    const dy = cloud.positions[i * 3 + 1]!;
    const dz = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(dx, dy, dz);

    // NaN g snaps to the target mean so the row draws at average intensity.
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

    // Sign bit = fallback-orientation flag; a NaN b/a stays NaN → round mask, no flag.
    const ab = cloud.axisRatio[i]!;
    interleaved[o + 5] = isFallbackArr[i] === 1 ? -Math.abs(ab) : ab;

    // Negated: PA runs east-of-north (CCW on sky), UV y points down, and
    // rotating the UV is the inverse of rotating the ellipse.
    const paRad = (-cloud.positionAngleDeg[i]! * Math.PI) / 180;
    interleaved[o + 6] = Math.cos(paRad);
    interleaved[o + 7] = Math.sin(paRad);

    // Shared helper so disk and thumbnail match this footprint; sign bit = fallback-diameter flag.
    const padded = paddedRadiusMpc(cloud.diameterKpc[i]!);
    interleaved[o + 8] = cloud.diameterIsFallback[i] === 1 ? -padded : padded;

    // Raw 0 (never baked) decodes to 1.
    interleaved[o + 9] = decodeAngularWeight(cloud.angularWeight[i]!);

    // From the offset slot-3 magnitude, not raw g: the mode-1 gate's thresholds
    // live on that shifted scale and would otherwise move by magOffset.
    interleaved[o + 10] = interleaved[o + 3]! - 5 * Math.log10(dMpc) - 25;

    // Raw physical absMag, not slot 3/10; `proceduralDiskSubsystem.ts` computes
    // the same `galaxySbAmp` so the point↔disk crossfade holds brightness.
    const absMag = absoluteFromApparent(g, dMpc);
    interleaved[o + 11] = galaxySbAmp(absMag, medianAbsMag, cloud.diameterKpc[i]!);
  }

  return { interleaved, isFallbackArr };
}
