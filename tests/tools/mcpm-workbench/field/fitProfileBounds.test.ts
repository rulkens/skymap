/**
 * fitProfileBounds — O(1) prefix lookup for the densest `fraction` of a
 * FitProfile's points. keptCount and the shrink-on-eviction behaviour are
 * the load-bearing properties auto-fit depends on.
 */
import { describe, expect, it } from 'vitest';
import { buildFitProfile } from '../../../../tools/mcpm-workbench/src/field/buildFitProfile';
import { fitProfileBounds } from '../../../../tools/mcpm-workbench/src/field/fitProfileBounds';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tight cluster near the origin plus a handful of far-flung stragglers.
function clusterWithStragglers(): Float32Array {
  const rng = mulberry32(42);
  const clusterN = 190;
  const stragglerN = 10;
  const positions = new Float32Array((clusterN + stragglerN) * 3);
  for (let i = 0; i < clusterN; i++) {
    positions[i * 3] = (rng() - 0.5) * 2; // ±1 Mpc
    positions[i * 3 + 1] = (rng() - 0.5) * 2;
    positions[i * 3 + 2] = (rng() - 0.5) * 2;
  }
  for (let i = 0; i < stragglerN; i++) {
    const base = (clusterN + i) * 3;
    const sign = i % 2 === 0 ? 1 : -1;
    positions[base] = sign * (500 + rng() * 100);
    positions[base + 1] = sign * (500 + rng() * 100);
    positions[base + 2] = sign * (500 + rng() * 100);
  }
  return positions;
}

describe('fitProfileBounds', () => {
  it('keptCount matches max(2, ceil(fraction*n)) clamped to n, exactly', () => {
    const positions = new Float32Array(20 * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = i;
    const profile = buildFitProfile(positions);

    expect(fitProfileBounds(profile, 0.1).keptCount).toBe(2); // ceil(2)=2, max(2,2)=2
    expect(fitProfileBounds(profile, 0.5).keptCount).toBe(10);
    expect(fitProfileBounds(profile, 0.95).keptCount).toBe(19);
    expect(fitProfileBounds(profile, 1).keptCount).toBe(20);
  });

  it('excludes far stragglers and shrinks the box by a large factor at fraction=0.95', () => {
    const positions = clusterWithStragglers();
    const profile = buildFitProfile(positions);

    const full = fitProfileBounds(profile, 1);
    const fitted = fitProfileBounds(profile, 0.95);

    const fullExtent = full.maxMpc[0] - full.minMpc[0];
    const fittedExtent = fitted.maxMpc[0] - fitted.minMpc[0];
    expect(fittedExtent).toBeLessThan(fullExtent / 10);
    // The fitted box should stay within the cluster's ±1 Mpc footprint, well
    // short of the ±500+ Mpc stragglers.
    for (const v of [...fitted.minMpc, ...fitted.maxMpc]) expect(Math.abs(v)).toBeLessThan(2);
  });

  it('n=2 keeps both points regardless of fraction', () => {
    const positions = new Float32Array([0, 0, 0, 10, 10, 10]);
    const profile = buildFitProfile(positions);
    for (const fraction of [0.01, 0.5, 1]) {
      const { minMpc, maxMpc, keptCount } = fitProfileBounds(profile, fraction);
      expect(keptCount).toBe(2);
      expect(minMpc).toEqual([0, 0, 0]);
      expect(maxMpc).toEqual([10, 10, 10]);
    }
  });

  it('n=1 keeps the single point regardless of fraction', () => {
    const positions = new Float32Array([7, 8, 9]);
    const profile = buildFitProfile(positions);
    for (const fraction of [0.01, 0.5, 1]) {
      const { minMpc, maxMpc, keptCount } = fitProfileBounds(profile, fraction);
      expect(keptCount).toBe(1);
      expect(minMpc).toEqual([7, 8, 9]);
      expect(maxMpc).toEqual([7, 8, 9]);
    }
  });
});
