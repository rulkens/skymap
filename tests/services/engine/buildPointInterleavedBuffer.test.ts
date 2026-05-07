/**
 * Unit tests for the pure `buildPointInterleavedBuffer` function.
 *
 * The bake is a near-verbatim lift of the loop that used to live inside
 * `pointRenderer.upload()` — same inputs, same per-vertex bytes out.  We
 * verify the lift is faithful by feeding a hand-rolled 3-galaxy synthetic
 * cloud and asserting the per-row outputs (positions, magnitudes,
 * vMaxWeight, schechterRatio) at known byte offsets.
 *
 * The Worker plumbing itself isn't exercised here (Vitest runs in Node
 * without a Worker constructor); see the project README's smoke-test
 * checklist for the manual verification step that catches the worker
 * bundle's transitive imports.
 *
 * ### Slot layout (post (source, localIdx) packing refactor)
 *
 *   slot 0,1,2 — position xyz
 *   slot 3     — magnitude
 *   slot 4     — colorIndex
 *   slot 5     — kPerZ
 *   slot 6     — axisRatio (sign bit = isFallback)
 *   slot 7     — positionAngleDeg
 *   slot 8     — diameterKpc
 *   slot 9     — vMaxWeight
 *   slot 10    — schechterRatio
 *   slot 11    — angularDensityWeight
 *
 * 12 slots × 4 bytes = 48 bytes per point.  No more globalInstanceIdx
 * slot — the picker now derives its packed identity from a per-source
 * uniform + the GPU's `@builtin(instance_index)`.
 */

import { describe, it, expect } from 'vitest';
import { buildPointInterleavedBuffer } from '../../../src/services/engine/buildPointInterleavedBuffer';
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
  it('produces an interleaved Float32Array of the expected length (12 slots × 4 bytes)', () => {
    const cloud = makeCloud(3);
    const result = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
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
    });
    expect(interleaved[0 * SLOTS + 0]).toBeCloseTo(10);
    expect(interleaved[0 * SLOTS + 1]).toBeCloseTo(20);
    expect(interleaved[0 * SLOTS + 2]).toBeCloseTo(30);
    expect(interleaved[1 * SLOTS + 0]).toBeCloseTo(-5);
    expect(interleaved[1 * SLOTS + 1]).toBeCloseTo(-10);
    expect(interleaved[1 * SLOTS + 2]).toBeCloseTo(-15);
  });

  it('writes axisRatio at slot 6 with positive sign for non-fallback rows', () => {
    // axisRatio = 0.7 is unlikely to match the deterministic
    // fallbackOrientation for these specific (objIDs, ra, dec) — so
    // the bake should keep the value positive (no sign-bit flip).
    const cloud = makeCloud(3);
    cloud.magG.set([18, 18, 18]);
    const { interleaved, isFallbackArr } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    for (let i = 0; i < 3; i++) {
      const ab = interleaved[i * SLOTS + 6]!;
      // Either positive (real measurement) or negative (fallback).  These
      // particular rows shouldn't be classified as fallback (their
      // (b/a, PA) doesn't match the deterministic hash output for the
      // dummy objID + (0,0,0) position), but we double-check via
      // isFallbackArr to keep the assertion robust.
      if (isFallbackArr[i] === 0) {
        expect(ab).toBeGreaterThan(0);
        expect(ab).toBeCloseTo(0.7, 5);
      } else {
        expect(ab).toBeLessThan(0);
        expect(Math.abs(ab)).toBeCloseTo(0.7, 5);
      }
    }
  });

  it('returns the survey schechter triple, mLim and central density nRef', () => {
    const cloud = makeCloud(1);
    const result = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
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

  it('writes vMaxWeight in slot 9; default fast mode leaves slot 10 at 1.0', () => {
    const cloud = makeCloud(1);
    // Place the galaxy at d = 100 Mpc with a typical SDSS-like apparent
    // magnitude.  The exact weight value depends on vMaxWeight()'s formula
    // — we only assert it's a finite number in [0, 1] (the clamp range).
    cloud.positions.set([100, 0, 0]);
    cloud.magG.set([16]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    const vMax = interleaved[9]!;
    const sch = interleaved[10]!;
    expect(Number.isFinite(vMax)).toBe(true);
    expect(vMax).toBeGreaterThanOrEqual(0);
    expect(vMax).toBeLessThanOrEqual(1);
    // Default mode is 'fast' → slot 10 is the multiplicative identity.
    // The shader's `select(1.0, schechterRatio, biasMode == 3u)` ignores
    // this slot in modes 0/1/2, so the visual is unchanged.
    expect(sch).toBe(1);
  });

  it('mode: fast writes 1.0 to schechterRatio (slot 10) for every row', () => {
    // Build a multi-row cloud spread across distances and assert every
    // row's slot 10 is exactly 1.0 — the multiplicative identity that
    // makes the shader's mode-3 multiplication a no-op.
    const cloud = makeCloud(5);
    for (let i = 0; i < 5; i++) {
      cloud.positions[i * 3 + 0] = (i + 1) * 100;
    }
    cloud.magG.set([16, 17, 18, 19, 20]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      mode: 'fast',
    });
    for (let i = 0; i < 5; i++) {
      expect(interleaved[i * SLOTS + 10]).toBe(1);
    }
  });

  it('mode: with-schechter writes the per-row symmetric-rebalance ratios in slot 10', () => {
    // Symmetric rebalance centers ratios on 1.0 (median pivot): far-field
    // boosts modestly (capped at 1.2×), near-field dims more aggressively
    // (down to 0.3×).  We assert at least one row off 1.0 — this catches
    // a regression where the bake silently degrades to fast-mode (which
    // writes 1.0 into slot 10 unconditionally).
    const cloud = makeCloud(5);
    cloud.positions.set([20, 0, 0, 50, 0, 0, 100, 0, 0, 200, 0, 0, 500, 0, 0]);
    cloud.magG.set([16, 17, 18, 19, 20]);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
      mode: 'with-schechter',
    });
    let sawNonUnity = false;
    for (let i = 0; i < 5; i++) {
      const r = interleaved[i * SLOTS + 10]!;
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(r).toBeLessThanOrEqual(1.2 + 1e-6);
      if (r !== 1) sawNonUnity = true;
    }
    expect(sawNonUnity).toBe(true);
  });

  it('writes 1.0 into the angularDensityWeight slot (slot 11) by default', () => {
    const cloud = makeCloud(3);
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.SDSS,
    });
    for (let i = 0; i < 3; i++) {
      expect(interleaved[i * SLOTS + 11]).toBe(1);
    }
  });

  it('shifts the per-survey magG mean toward the SDSS target (≈18)', () => {
    // Build a cloud whose mean magG is far from 18 — verify the bake's
    // output mean (slot 3 across all rows) lands close to 18.
    const cloud = makeCloud(3);
    cloud.magG.set([5, 6, 7]); // 2MRS-like J-band brightnesses
    const { interleaved } = buildPointInterleavedBuffer({
      cloud,
      source: Source.TwoMRS,
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
    });
    expect(interleaved[4]).toBe(999);
    // K-correction defaults to 0 when the colour is absent.
    expect(interleaved[5]).toBe(0);
  });
});
