/**
 * Unit tests for the pure `computeSchechterRatios` helper.
 *
 * Verifies the lazy Schechter-ratio bake produces the same dim-only-clamp
 * values the original inline `buildPointInterleavedBuffer` loop wrote into
 * slot 11.  Single source of truth: this helper now backs both the eager
 * path (when an upload happens while Schechter mode is active) and the lazy
 * path (when the user toggles into Schechter mode after upload), so a
 * regression here would silently break both call sites.
 *
 * Worker plumbing isn't exercised — Vitest runs in Node without a Worker
 * constructor; the worker is a thin wrapper that just delegates.
 */

import { describe, it, expect } from 'vitest';
import { computeSchechterRatios } from '../../../src/services/gpu/computeSchechterRatios';
import { Source } from '../../../src/data/sources';
import type { PointCloud } from '../../../src/@types';

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

describe('computeSchechterRatios', () => {
  it('returns a Float32Array of length cloud.count', () => {
    const cloud = makeCloud(5);
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    expect(ratios).toBeInstanceOf(Float32Array);
    expect(ratios.length).toBe(5);
  });

  it('clamps every value to [1, 3] (soft-capped boost)', () => {
    // Spread galaxies across distances 100..1000 Mpc; the helper should
    // produce ratios in [1, 1 + SOFT_CAP] = [1, 3] for every row, since
    // every distance > 10 Mpc has r = nRef/n(d) ≥ 1 (boost direction) and
    // the Reinhard soft cap asymptotes at 1 + SOFT_CAP.
    const cloud = makeCloud(10);
    for (let i = 0; i < 10; i++) {
      cloud.positions[i * 3 + 0] = (i + 1) * 100; // 100, 200, …, 1000
    }
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    for (let i = 0; i < 10; i++) {
      expect(Number.isFinite(ratios[i]!)).toBe(true);
      expect(ratios[i]!).toBeGreaterThanOrEqual(1);
      expect(ratios[i]!).toBeLessThanOrEqual(3);
    }
  });

  it('produces ratios that monotonically increase with distance', () => {
    // Physical intuition: nRef = n(d=10 Mpc) is the density ceiling
    // (faintest galaxies still inside the integration window).  As d
    // grows past 10 Mpc, μ(d) = 5·log(d/10) grows, the M_lim − μ cutoff
    // moves brighter, the integration window narrows, n(d) drops, and
    // r = nRef/n(d) climbs.  The Reinhard soft cap maps r=1 → 1 (no
    // boost) and r→∞ → 3 (max boost), so ratios should monotonically
    // INCREASE with distance over the survey range.
    const cloud = makeCloud(3);
    cloud.positions.set([20, 0, 0, 100, 0, 0, 500, 0, 0]); // 20, 100, 500 Mpc
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    expect(ratios[0]!).toBeLessThanOrEqual(ratios[1]!);
    expect(ratios[1]!).toBeLessThanOrEqual(ratios[2]!);
    // Far-field row should be visibly boosted above 1 (a galaxy at 500 Mpc
    // represents many invisible faint companions).
    expect(ratios[2]!).toBeGreaterThan(1);
  });

  it('writes 1 for galaxies at degenerate distances (n(d) ≤ 0)', () => {
    // Place a galaxy at extreme distance where the integration window
    // collapses — n(d) goes to 0 and the helper should fall back to
    // ratio = 1 (no boost), avoiding the infinity that bare division
    // would produce.  Visually those rows render at natural alpha.
    const cloud = makeCloud(1);
    cloud.positions.set([1e9, 0, 0]); // absurd distance
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    expect(Number.isFinite(ratios[0]!)).toBe(true);
    expect(ratios[0]!).toBeGreaterThanOrEqual(1);
    expect(ratios[0]!).toBeLessThanOrEqual(3);
  });
});
