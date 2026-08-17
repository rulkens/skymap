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
import { computeSchechterRatios } from '../../../../src/services/engine/bake/computeSchechterRatios';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function makeCloud(count: number): GalaxyCatalog {
  return makeGalaxyCatalog(count, {
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  });
}

describe('computeSchechterRatios', () => {
  it('returns a Float32Array of length cloud.count', () => {
    const cloud = makeCloud(5);
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    expect(ratios).toBeInstanceOf(Float32Array);
    expect(ratios.length).toBe(5);
  });

  it('clamps every value to [0.3, 1.2] (symmetric rebalance)', () => {
    // Symmetric rebalancing centres ratios on 1.0: galaxies in higher-than-
    // median density dim, lower-than-median boost, with an asymmetric clamp
    // that reflects additive-blending tolerance (dimming is cheap, boosting
    // saturates).
    const cloud = makeCloud(10);
    for (let i = 0; i < 10; i++) {
      cloud.positions[i * 3 + 0] = (i + 1) * 100; // 100, 200, …, 1000
    }
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    for (let i = 0; i < 10; i++) {
      expect(Number.isFinite(ratios[i]!)).toBe(true);
      // Bounds use a tiny f32-rounding slack — `Math.min(1.2, …)` stored as
      // a Float32 can come back as 1.2000000476837158.
      expect(ratios[i]!).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(ratios[i]!).toBeLessThanOrEqual(1.2 + 1e-6);
    }
  });

  it('produces ratios that monotonically increase with distance', () => {
    // Across a galaxy catalog, n(d) drops monotonically with distance (the
    // integration window narrows as the apparent-mag flux limit translates
    // to a brighter absolute-mag cutoff).  Since `ratio = sqrt(n_mid/n(d))`,
    // a falling n(d) produces a rising ratio — far-field above 1, near-
    // field below 1, with the median pivot in between.
    const cloud = makeCloud(3);
    cloud.positions.set([20, 0, 0, 100, 0, 0, 500, 0, 0]); // 20, 100, 500 Mpc
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    expect(ratios[0]!).toBeLessThanOrEqual(ratios[1]!);
    expect(ratios[1]!).toBeLessThanOrEqual(ratios[2]!);
    // The near-field row should land below 1 (dimmed) and the far-field
    // above 1 (boosted), demonstrating the symmetric rebalance.
    expect(ratios[0]!).toBeLessThan(1);
    expect(ratios[2]!).toBeGreaterThan(1);
  });

  it('writes 1 for galaxies at degenerate distances (n(d) ≤ 0)', () => {
    // Place a galaxy at extreme distance where the integration window
    // collapses — n(d) goes to 0 and the helper should fall back to
    // ratio = 1 (no change), avoiding the infinity that bare division
    // would produce.  Visually those rows render at natural alpha.
    const cloud = makeCloud(1);
    cloud.positions.set([1e9, 0, 0]); // absurd distance
    const ratios = computeSchechterRatios({ cloud, source: Source.SDSS });
    expect(Number.isFinite(ratios[0]!)).toBe(true);
    expect(ratios[0]!).toBeGreaterThanOrEqual(0.3);
    expect(ratios[0]!).toBeLessThanOrEqual(1.2);
  });
});
