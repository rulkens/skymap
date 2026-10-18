/**
 * Unit tests for the pure `buildPointInterleavedBuffer` function, run inline
 * (Vitest's Node has no Worker). The 12-slot record layout is documented on
 * `SLOTS_PER_GALAXY_POINT` in the bake and pinned against the GPU table in
 * `galaxyPointVertexLayout.test.ts`; the per-row derivations are pinned in
 * `derivePointRecord.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { buildPointInterleavedBuffer } from '../../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { galaxyMagOffset } from '../../../../src/utils/galaxy/galaxyMagOffset';
import { galaxyMedianAbsMag } from '../../../../src/utils/galaxy/galaxyMedianAbsMag';

/** Build a tiny synthetic cloud with three galaxies at known coordinates. */
function makeCloud(count: number): GalaxyCatalog {
  return makeGalaxyCatalog(count, {
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  });
}

const SLOTS = 12;

/** The stats the flat record source hands the bake for this cloud. */
function statsOf(cloud: GalaxyCatalog) {
  return { magOffset: galaxyMagOffset(cloud), medianAbsMag: galaxyMedianAbsMag(cloud) };
}

describe('buildPointInterleavedBuffer', () => {
  it('produces an interleaved Float32Array of the expected length (12 slots × 4 bytes)', () => {
    const cloud = makeCloud(3);
    const result = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      stats: statsOf(cloud),
    });
    expect(result.interleaved).toBeInstanceOf(Float32Array);
    expect(result.interleaved.length).toBe(3 * SLOTS);
    expect(result.interleaved.byteLength).toBe(3 * SLOTS * 4);
  });

  it('writes positions into slots 0..2 of each vertex record', () => {
    const cloud = makeCloud(2);
    cloud.positions.set([10, 20, 30, -5, -10, -15]);
    cloud.magG.set([18, 18]); // identical so per-galaxy-catalog shift is zero
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      stats: statsOf(cloud),
    });
    expect(interleaved[0 * SLOTS + 0]).toBeCloseTo(10);
    expect(interleaved[0 * SLOTS + 1]).toBeCloseTo(20);
    expect(interleaved[0 * SLOTS + 2]).toBeCloseTo(30);
    expect(interleaved[1 * SLOTS + 0]).toBeCloseTo(-5);
    expect(interleaved[1 * SLOTS + 1]).toBeCloseTo(-10);
    expect(interleaved[1 * SLOTS + 2]).toBeCloseTo(-15);
  });

  it('writes the decoded angular weight into slot 9 (raw 128 → 1, raw 255 → 10, raw 0 → 1)', () => {
    const cloud = makeCloud(3);
    cloud.angularWeight.set([128, 255, 0]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      stats: statsOf(cloud),
    });
    expect(interleaved[0 * SLOTS + 9]).toBe(1);
    expect(interleaved[1 * SLOTS + 9]).toBeCloseTo(10, 4);
    expect(interleaved[2 * SLOTS + 9]).toBe(1);
  });

  it('routes each fallback flag to its own slot sign and echoes the orientation flags', () => {
    const cloud = makeCloud(3);
    cloud.orientationIsFallback.set([0, 1, 0]);
    cloud.diameterIsFallback.set([0, 0, 1]);
    const { interleaved, isFallbackArr } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      stats: statsOf(cloud),
    });
    expect([0, 1, 2].map((r) => Math.sign(interleaved[r * SLOTS + 5]!))).toEqual([1, -1, 1]);
    expect([0, 1, 2].map((r) => Math.sign(interleaved[r * SLOTS + 8]!))).toEqual([1, 1, -1]);
    expect([...isFallbackArr]).toEqual([0, 1, 0]);
  });

  it('shifts the per-galaxy-catalog magG mean toward the SDSS target (≈18)', () => {
    // Build a cloud whose mean magG is far from 18 — verify the bake's
    // output mean (slot 3 across all rows) lands close to 18.
    const cloud = makeCloud(3);
    cloud.magG.set([5, 6, 7]); // 2MRS-like J-band brightnesses
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.TwoMRS,
      stats: statsOf(cloud),
    });
    const mags = [
      interleaved[0 * SLOTS + 3]!,
      interleaved[1 * SLOTS + 3]!,
      interleaved[2 * SLOTS + 3]!,
    ];
    const meanOut = (mags[0]! + mags[1]! + mags[2]!) / 3;
    expect(meanOut).toBeCloseTo(18, 5);
  });

  it('writes the unknown-colour fallback (1.05) when the row lacks usable bands', () => {
    const cloud = makeCloud(1);
    // SDSS picks u−g.  Setting both bands to NaN forces pickColourIndex
    // to return null, which the bake maps to UNKNOWN_COLOUR_RAMP_POSITION
    // (1.05) — the shared neutral-ramp value both renderers substitute.
    cloud.magU.set([NaN]);
    cloud.magG.set([NaN]);
    cloud.magR.set([NaN]);
    cloud.magI.set([NaN]);
    cloud.magZ.set([NaN]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      stats: statsOf(cloud),
    });
    expect(interleaved[4]).toBeCloseTo(1.05, 5);
  });
});
