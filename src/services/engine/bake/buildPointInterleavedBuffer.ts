/**
 * buildPointInterleavedBuffer — the per-galaxy vertex bake, pure so it runs
 * alike in the upload worker (`catalogStore`'s `defaultWorkerRunner`; ~3.5 M
 * rows would freeze the main thread) and in Node tests. The record must match
 * `galaxyPointVertexLayout.ts` byte-for-byte — one side alone corrupts every billboard.
 */

import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { decodeAngularWeight } from '../../../utils/galaxy/decodeAngularWeight';
import { derivePointRecord } from '../../../utils/galaxy/derivePointRecord';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';
import type { GalaxyPointFields } from '../../../@types/engine/GalaxyPointFields';
import type { GalaxyPointDerived } from '../../../@types/engine/GalaxyPointDerived';

/**
 * f32 slots per point, duplicated from `galaxyPointVertexLayout.ts` so the
 * worker bundle never pulls in WebGPU and `?static` shader imports:
 * 0-2 xyz · 3 magnitude · 4 colorIndex · 5 axisRatio (sign = isFallback) ·
 * 6-7 paCos, paSin · 8 radiusMpc (sign = diameterIsFallback) ·
 * 9 angularWeight · 10 absMag · 11 sbAmp
 */
const SLOTS_PER_GALAXY_POINT = 12;

export function buildPointInterleavedBuffer(
  input: BuildPointInterleavedBufferInput,
): BuildPointInterleavedBufferResult {
  const { cloud, source, stats } = input;
  const arrayBuffer = new ArrayBuffer(cloud.count * SLOTS_PER_GALAXY_POINT * 4);
  const interleaved = new Float32Array(arrayBuffer);

  // Sliced so the worker can transfer it without detaching the caller's cloud.
  const isFallbackArr = cloud.orientationIsFallback.slice();

  const fields: GalaxyPointFields = {
    x: 0,
    y: 0,
    z: 0,
    magnitude: 0,
    axisRatio: 0,
    positionAngleDeg: 0,
    diameterKpc: 0,
    orientationIsFallback: false,
    diameterIsFallback: false,
  };
  const d: GalaxyPointDerived = {
    magnitude: 0,
    axisRatio: 0,
    paCos: 0,
    paSin: 0,
    radiusMpc: 0,
    absMag: 0,
    sbAmp: 0,
  };

  for (let i = 0; i < cloud.count; i++) {
    const o = i * SLOTS_PER_GALAXY_POINT;
    fields.x = cloud.positions[i * 3 + 0]!;
    fields.y = cloud.positions[i * 3 + 1]!;
    fields.z = cloud.positions[i * 3 + 2]!;
    fields.magnitude = cloud.magG[i]!;
    fields.axisRatio = cloud.axisRatio[i]!;
    fields.positionAngleDeg = cloud.positionAngleDeg[i]!;
    fields.diameterKpc = cloud.diameterKpc[i]!;
    fields.orientationIsFallback = isFallbackArr[i] === 1;
    fields.diameterIsFallback = cloud.diameterIsFallback[i] === 1;
    derivePointRecord(fields, stats, d);

    interleaved[o + 0] = fields.x;
    interleaved[o + 1] = fields.y;
    interleaved[o + 2] = fields.z;
    interleaved[o + 3] = d.magnitude;
    interleaved[o + 4] = pickColourIndex(
      source,
      cloud.magU[i]!,
      cloud.magG[i]!,
      cloud.magR[i]!,
      cloud.magI[i]!,
      cloud.magZ[i]!,
      Math.hypot(fields.x, fields.y, fields.z),
    );
    interleaved[o + 5] = d.axisRatio;
    interleaved[o + 6] = d.paCos;
    interleaved[o + 7] = d.paSin;
    interleaved[o + 8] = d.radiusMpc;
    // Raw 0 (never baked) decodes to 1.
    interleaved[o + 9] = decodeAngularWeight(cloud.angularWeight[i]!);
    interleaved[o + 10] = d.absMag;
    interleaved[o + 11] = d.sbAmp;
  }

  return { interleaved, isFallbackArr };
}
