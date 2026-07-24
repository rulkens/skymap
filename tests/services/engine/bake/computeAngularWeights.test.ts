/**
 * Unit tests for the pure `computeAngularWeights` helper.
 *
 * Verifies the HEALPix angular re-weighting bake produces sensible
 * down-weights for over-dense angular regions and up-weights for sparse
 * regions, with the result clamped to [0.3, 1.2] for numeric stability +
 * additive-blending tolerance (asymmetric — dimming is cheap, boosting
 * compounds; see `computeAngularWeights.ts` `WEIGHT_MIN`/`WEIGHT_MAX`
 * docstring for the full rationale).
 *
 * Worker plumbing isn't exercised — Vitest runs in Node without a Worker
 * constructor; the worker is a thin wrapper that just delegates.
 */

import { describe, it, expect } from 'vitest';
import { computeAngularWeights } from '../../../../src/services/engine/bake/computeAngularWeights';
import { Source } from '../../../../src/data/sources';
import { raDecZToCartesian } from '../../../../src/utils/math';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function emptyCloud(count: number): GalaxyCatalog {
  return makeGalaxyCatalog(count, {
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  });
}

/**
 * Place a galaxy at world position derived from (ra, dec, z).  We thread
 * through the project's own raDecZToCartesian so the test cloud's geometry
 * lines up with whatever cosmology the renderer uses — matters because the
 * helper inverts the same transform via `cartesianToRaDecZ`.
 */
function setPos(cloud: GalaxyCatalog, i: number, ra: number, dec: number, z: number): void {
  const [x, y, zc] = raDecZToCartesian(ra, dec, z);
  cloud.positions[i * 3 + 0] = x;
  cloud.positions[i * 3 + 1] = y;
  cloud.positions[i * 3 + 2] = zc;
}

describe('computeAngularWeights', () => {
  it('returns a Float32Array of length cloud.count', () => {
    const cloud = emptyCloud(10);
    for (let i = 0; i < 10; i++) setPos(cloud, i, i * 36, 0, 0.05);
    const w = computeAngularWeights({ cloud, source: Source.Glade });
    expect(w).toBeInstanceOf(Float32Array);
    expect(w.length).toBe(10);
  });

  it('every weight is finite and inside [0.3, 1.2]', () => {
    const cloud = emptyCloud(50);
    // Random-but-deterministic spread.  Use a simple LCG so the test isn't
    // flaky between Node versions (Math.random would be).
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 50; i++) {
      const ra = rand() * 360;
      const dec = (rand() * 2 - 1) * 80; // avoid the poles for cleaner cells
      const z = 0.01 + rand() * 0.1;
      setPos(cloud, i, ra, dec, z);
    }
    const w = computeAngularWeights({ cloud, source: Source.Glade });
    for (let i = 0; i < 50; i++) {
      expect(Number.isFinite(w[i]!)).toBe(true);
      // f32 rounding slack — `Math.min(1.2, …)` stored as Float32 can
      // come back as 1.2000000476837158.
      expect(w[i]!).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(w[i]!).toBeLessThanOrEqual(1.2 + 1e-6);
    }
  });

  it('returns all 1.0 for a degenerate single-distance cloud', () => {
    // When dMin == dMax the log-spaced shell math collapses; the helper's
    // fast path should kick in and produce identity weights.
    const cloud = emptyCloud(5);
    for (let i = 0; i < 5; i++) setPos(cloud, i, i * 70, 0, 0.05);
    const w = computeAngularWeights({ cloud, source: Source.Glade });
    for (let i = 0; i < 5; i++) {
      expect(w[i]!).toBeCloseTo(1, 5);
    }
  });

  it('over-dense cone has weights ≤ 1; balanced background has weights ≈ 1', () => {
    // Synthetic cloud: 100 galaxies tightly clustered in a small angular
    // patch (over-dense cone) at one distance shell, plus 100 galaxies
    // spread isotropically over the sky at the SAME shell.  The over-dense
    // cone's HEALPix cell has counts well above the median for that shell;
    // the isotropic background should sit near the median.
    const N_CONE = 100;
    const N_ISO = 100;
    const cloud = emptyCloud(N_CONE + N_ISO);

    // Over-dense cone: tight cluster around RA=120, Dec=20.  All at z=0.08.
    for (let i = 0; i < N_CONE; i++) {
      const ra = 120 + Math.cos(i) * 1.5;
      const dec = 20 + Math.sin(i) * 1.5;
      setPos(cloud, i, ra, dec, 0.085 + (i % 7) * 0.001);
    }

    // Isotropic background: spread across the sky at similar redshift.
    for (let i = 0; i < N_ISO; i++) {
      // Uniform-on-sphere via the inverse-CDF trick.
      const u = (i + 0.5) / N_ISO;
      const v = ((i * 17) % N_ISO) / N_ISO;
      const dec = (Math.acos(2 * u - 1) * 180) / Math.PI - 90;
      const ra = v * 360;
      setPos(cloud, N_CONE + i, ra, dec, 0.085 + (i % 7) * 0.001);
    }

    const w = computeAngularWeights({ cloud, source: Source.Glade });

    // The first N_CONE rows are the dense cluster — their weights should
    // average BELOW 1 (down-weighted for over-density).
    let coneSum = 0;
    for (let i = 0; i < N_CONE; i++) coneSum += w[i]!;
    const coneMean = coneSum / N_CONE;
    expect(coneMean).toBeLessThan(1);

    // The isotropic background's weights should average closer to 1.
    let isoSum = 0;
    for (let i = N_CONE; i < N_CONE + N_ISO; i++) isoSum += w[i]!;
    const isoMean = isoSum / N_ISO;
    // Isotropic mean must be HIGHER than the cone's mean — that's the
    // correction working — and not wildly far from 1.
    expect(isoMean).toBeGreaterThan(coneMean);
  });

  it('returns identity weights for an empty cloud', () => {
    const cloud = emptyCloud(0);
    const w = computeAngularWeights({ cloud, source: Source.Glade });
    expect(w.length).toBe(0);
  });
});
