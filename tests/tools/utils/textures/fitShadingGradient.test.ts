import { describe, expect, it } from 'vitest';

import { fitShadingGradient } from '../../../../tools/utils/textures/fitShadingGradient';

// Deterministic PRNG so a failing run reproduces exactly, without pulling in
// a shared seeded-random helper for one test file's synthetic slopes.
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

function randomSlopes(n: number, seed: number): { sx: Float32Array; sy: Float32Array } {
  const rand = mulberry32(seed);
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sx[i] = (rand() - 0.5) * 0.4;
    sy[i] = (rand() - 0.5) * 0.4;
  }
  return { sx, sy };
}

describe('fitShadingGradient', () => {
  it('recovers a planted g = (0.8, -0.3) from random slopes within 2%', () => {
    const n = 500;
    const { sx, sy } = randomSlopes(n, 1);
    const y = new Float32Array(n);
    const weight = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) y[i] = 0.8 * sx[i]! + -0.3 * sy[i]!;

    const { gx, gy } = fitShadingGradient(y, sx, sy, weight);
    expect(gx).toBeCloseTo(0.8, 1);
    expect(Math.abs(gx - 0.8)).toBeLessThan(0.02 * Math.abs(0.8));
    expect(Math.abs(gy - -0.3)).toBeLessThan(0.02 * Math.abs(0.3));
  });

  it('planted g with independent albedo noise (σ 0.1) still recovers within 10%, confidence > 0.3', () => {
    const n = 2000;
    const { sx, sy } = randomSlopes(n, 2);
    const rand = mulberry32(3);
    const y = new Float32Array(n);
    const weight = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      // Box-Muller for approximately-Gaussian albedo noise, independent of slope.
      const u1 = Math.max(1e-9, rand());
      const u2 = rand();
      const noise = 0.1 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      y[i] = 0.8 * sx[i]! + -0.3 * sy[i]! + noise;
    }

    const { gx, gy, confidence } = fitShadingGradient(y, sx, sy, weight);
    expect(Math.abs(gx - 0.8)).toBeLessThan(0.1 * Math.abs(0.8));
    expect(Math.abs(gy - -0.3)).toBeLessThan(0.1 * Math.abs(0.3));
    expect(confidence).toBeGreaterThan(0.3);
  });

  it('flat terrain (all slopes 0) returns confidence 0, not NaN', () => {
    const n = 100;
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    const y = new Float32Array(n).fill(0.05);
    const weight = new Float32Array(n).fill(1);

    const { gx, gy, confidence } = fitShadingGradient(y, sx, sy, weight);
    expect(Number.isFinite(gx)).toBe(true);
    expect(Number.isFinite(gy)).toBe(true);
    expect(confidence).toBe(0);
  });
});
