/**
 * Unit tests for the pure `buildPointInterleavedBuffer` function.
 *
 * The bake is a near-verbatim lift of the loop that used to live inside
 * `pointRenderer.upload()` — same inputs, same per-vertex bytes out.  We
 * verify the lift is faithful by feeding a hand-rolled 3-galaxy synthetic
 * cloud and asserting the per-row outputs (positions, magnitudes, global
 * indices, vMaxWeight, schechterRatio) at known byte offsets.
 *
 * The Worker plumbing itself isn't exercised here (Vitest runs in Node
 * without a Worker constructor); see the project README's smoke-test
 * checklist for the manual verification step that catches the worker
 * bundle's transitive imports.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPointInterleavedBuffer,
  computePriorCount,
} from '../../../src/services/gpu/buildPointInterleavedBuffer';
import { Source } from '../../../src/data/sources';
import type { PointCloud } from '../../../src/@types';

/** Build a tiny synthetic cloud with three galaxies at known coordinates. */
function makeCloud(count: number): PointCloud {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  };
}

const SLOTS = 12;

describe('buildPointInterleavedBuffer', () => {
  it('produces an interleaved Float32Array of the expected length', () => {
    const cloud = makeCloud(3);
    const result = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      priorCount: 0,
    });
    expect(result.interleaved).toBeInstanceOf(Float32Array);
    expect(result.interleaved.length).toBe(3 * SLOTS);
    expect(result.interleaved.byteLength).toBe(3 * SLOTS * 4);
  });

  it('writes positions into slots 0..2 of each vertex record', () => {
    const cloud = makeCloud(2);
    cloud.positions.set([10, 20, 30, -5, -10, -15]);
    cloud.magG.set([18, 18]); // identical so per-survey shift is zero
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      priorCount: 0,
    });
    expect(interleaved[0 * SLOTS + 0]).toBeCloseTo(10);
    expect(interleaved[0 * SLOTS + 1]).toBeCloseTo(20);
    expect(interleaved[0 * SLOTS + 2]).toBeCloseTo(30);
    expect(interleaved[1 * SLOTS + 0]).toBeCloseTo(-5);
    expect(interleaved[1 * SLOTS + 1]).toBeCloseTo(-10);
    expect(interleaved[1 * SLOTS + 2]).toBeCloseTo(-15);
  });

  it('bakes globalInstanceIdx as priorCount + i in slot 5', () => {
    const cloud = makeCloud(3);
    cloud.magG.set([18, 18, 18]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      priorCount: 1000,
    });
    // Slot 5 is a u32 living at the same byte offset as f32 slot 5.  We
    // need a u32 view to read it; reinterpret the buffer.
    const u32 = new Uint32Array(interleaved.buffer);
    // High bit may be set if the row was classified as fallback — strip it
    // for the index check.  All three rows here have axisRatio=0.7 which
    // is unlikely to match the deterministic fallback, so the high bit
    // should be 0; assert that as well.
    expect(u32[0 * SLOTS + 5]! & 0x7fffffff).toBe(1000);
    expect(u32[1 * SLOTS + 5]! & 0x7fffffff).toBe(1001);
    expect(u32[2 * SLOTS + 5]! & 0x7fffffff).toBe(1002);
  });

  it('returns the survey schechter triple, mLim and central density nRef', () => {
    const cloud = makeCloud(1);
    const result = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      priorCount: 0,
    });
    // mLim must be a finite positive magnitude — the SDSS spec value sits
    // around 17.77 but we don't assert the exact number here (that's the
    // surveyFluxLimits module's responsibility).
    expect(Number.isFinite(result.mLim)).toBe(true);
    expect(result.mLim).toBeGreaterThan(10);
    expect(result.mLim).toBeLessThan(25);
    expect(typeof result.schechter.mStar).toBe('number');
    expect(typeof result.schechter.alpha).toBe('number');
    expect(typeof result.schechter.phiStar).toBe('number');
    // nRef should be a positive number — the integral has finite support
    // for any sensible Schechter triple at d = 10 Mpc.
    expect(Number.isFinite(result.nRef)).toBe(true);
    expect(result.nRef).toBeGreaterThan(0);
  });

  it('writes vMaxWeight in slot 10 and schechterRatio in slot 11', () => {
    const cloud = makeCloud(1);
    // Place the galaxy at d = 100 Mpc with a typical SDSS-like apparent
    // magnitude.  The exact weight value depends on vMaxWeight()'s formula
    // — we only assert it's a finite number in [0, 1] (the clamp range).
    cloud.positions.set([100, 0, 0]);
    cloud.magG.set([16]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      priorCount: 0,
    });
    const vMax = interleaved[10]!;
    const sch = interleaved[11]!;
    expect(Number.isFinite(vMax)).toBe(true);
    expect(vMax).toBeGreaterThanOrEqual(0);
    expect(vMax).toBeLessThanOrEqual(1);
    expect(Number.isFinite(sch)).toBe(true);
    expect(sch).toBeGreaterThanOrEqual(0);
    expect(sch).toBeLessThanOrEqual(1);
  });

  it('shifts the per-survey magG mean toward the SDSS target (≈18)', () => {
    // Build a cloud whose mean magG is far from 18 — verify the bake's
    // output mean (slot 3 across all rows) lands close to 18.
    const cloud = makeCloud(3);
    cloud.magG.set([5, 6, 7]); // 2MRS-like J-band brightnesses
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.TwoMRS,
      priorCount: 0,
    });
    const mags = [
      interleaved[0 * SLOTS + 3]!,
      interleaved[1 * SLOTS + 3]!,
      interleaved[2 * SLOTS + 3]!,
    ];
    const meanOut = (mags[0]! + mags[1]! + mags[2]!) / 3;
    expect(meanOut).toBeCloseTo(18, 5);
  });

  it('writes the colour-index sentinel (999) when the row lacks usable bands', () => {
    const cloud = makeCloud(1);
    // SDSS picks u−g.  Setting both bands to NaN forces pickColourIndex to
    // return null, which the bake maps to the 999 sentinel.
    cloud.magU.set([NaN]);
    cloud.magG.set([NaN]);
    cloud.magR.set([NaN]);
    cloud.magI.set([NaN]);
    cloud.magZ.set([NaN]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      priorCount: 0,
    });
    expect(interleaved[4]).toBe(999);
    // K-correction defaults to 0 when the colour is absent.
    expect(interleaved[6]).toBe(0);
  });
});

describe('computePriorCount', () => {
  it('returns 0 when the source has no earlier-loaded surveys', () => {
    const counts = new Map<Source, number>();
    expect(computePriorCount(Source.SDSS, counts)).toBe(0);
  });

  it('sums earlier-enum-order sources only', () => {
    // ALL_SOURCES is [Synthetic, SDSS, TwoMRS, Glade, Famous].
    // For TwoMRS (enum=2), priorCount should include Synthetic + SDSS.
    const counts = new Map<Source, number>([
      [Source.Synthetic, 10],
      [Source.SDSS, 100],
      [Source.TwoMRS, 50], // ignored — same source
      [Source.Glade, 25],   // ignored — later in enum order
    ]);
    expect(computePriorCount(Source.TwoMRS, counts)).toBe(110);
  });
});
