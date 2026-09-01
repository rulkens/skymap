/**
 * buildFitProfile — fraction=1 must reproduce catalogBounds bit-for-bit
 * (both fold the same min/max over the same points, just in different
 * orders), and a zero-IQR axis must not poison the rank with NaN.
 */
import { describe, expect, it } from 'vitest';
import { buildFitProfile } from '../../../../tools/mcpm-workbench/src/field/buildFitProfile';
import { fitProfileBounds } from '../../../../tools/mcpm-workbench/src/field/fitProfileBounds';
import { catalogBounds } from '../../../../tools/mcpm-workbench/src/field/catalogBounds';

// Deterministic PRNG so the "matches catalogBounds" property is checked
// against many point clouds, not one hand-picked fixture.
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

function randomPositions(n: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (rng() - 0.5) * 200;
  return positions;
}

describe('buildFitProfile', () => {
  it('fraction=1 reproduces catalogBounds bit-for-bit on random data', () => {
    const positions = randomPositions(500, 12345);
    const profile = buildFitProfile(positions);
    const { minMpc, maxMpc } = fitProfileBounds(profile, 1);
    const expected = catalogBounds(positions);
    expect(minMpc).toEqual(expected.min);
    expect(maxMpc).toEqual(expected.max);
  });

  it('does not produce NaN when an axis is degenerate (all points coplanar)', () => {
    const rng = mulberry32(999);
    const n = 200;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (rng() - 0.5) * 100;
      positions[i * 3 + 1] = (rng() - 0.5) * 100;
      positions[i * 3 + 2] = 0; // z collapsed to a plane: zero IQR on z
    }
    const profile = buildFitProfile(positions);
    for (const arr of [profile.prefixMin, profile.prefixMax]) {
      for (const v of arr) expect(Number.isNaN(v)).toBe(false);
    }
    const { minMpc, maxMpc, keptCount } = fitProfileBounds(profile, 0.5);
    expect(Number.isNaN(minMpc[2])).toBe(false);
    expect(Number.isNaN(maxMpc[2])).toBe(false);
    expect(keptCount).toBeGreaterThan(0);
  });

  it('handles a single point without NaN', () => {
    const positions = new Float32Array([3, -4, 5]);
    const profile = buildFitProfile(positions);
    expect(profile.count).toBe(1);
    const { minMpc, maxMpc, keptCount } = fitProfileBounds(profile, 1);
    expect(keptCount).toBe(1);
    expect(minMpc).toEqual([3, -4, 5]);
    expect(maxMpc).toEqual([3, -4, 5]);
  });
});
