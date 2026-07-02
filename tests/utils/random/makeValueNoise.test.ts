import { describe, it, expect } from 'vitest';
import { makeValueNoise } from '../../../src/utils/random/makeValueNoise';
import { mulberry32 } from '../../../src/utils/random/mulberry32';

describe('makeValueNoise', () => {
  it('same seed and coords give the same value', () => {
    const a = makeValueNoise(42);
    const b = makeValueNoise(42);
    const probes: [number, number, number][] = [
      [0, 0, 0],
      [1.5, 2.25, -3.75],
      [-10, 10, 0.1],
      [3.3, 3.3, 3.3],
    ];
    for (const [x, y, z] of probes) {
      expect(a(x, y, z)).toBe(b(x, y, z));
    }
  });

  it('different seeds decorrelate', () => {
    const a = makeValueNoise(1);
    const b = makeValueNoise(2);
    const probes: [number, number, number][] = [
      [0.5, 0.5, 0.5],
      [1.5, 2.25, -3.75],
      [-10, 10, 0.1],
    ];
    expect(probes.some(([x, y, z]) => a(x, y, z) !== b(x, y, z))).toBe(true);
  });

  it('outputs stay in [0, 1)', () => {
    const rand = mulberry32(99);
    const noise = makeValueNoise(7);
    for (let i = 0; i < 1000; i++) {
      // Sweep a wide range including negative coordinates.
      const x = (rand() - 0.5) * 200;
      const y = (rand() - 0.5) * 200;
      const z = (rand() - 0.5) * 200;
      const v = noise(x, y, z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('varies smoothly between lattice points', () => {
    const rand = mulberry32(5);
    const noise = makeValueNoise(11);
    for (let i = 0; i < 100; i++) {
      const x = (rand() - 0.5) * 50;
      const y = (rand() - 0.5) * 50;
      const z = (rand() - 0.5) * 50;
      const v0 = noise(x, y, z);
      const v1 = noise(x + 0.01, y, z);
      expect(Math.abs(v1 - v0)).toBeLessThan(0.1);
    }
  });

  it('is continuous at lattice corners', () => {
    const noise = makeValueNoise(3);
    // Smoothstep weights vanish at integer coordinates, so nudging just off
    // a lattice corner should barely move the output.
    for (const [i, j, k] of [
      [0, 0, 0],
      [2, -3, 1],
      [-1, 4, -2],
    ] as const) {
      const atCorner = noise(i, j, k);
      const justOff = noise(i + 1e-6, j, k);
      expect(Math.abs(justOff - atCorner)).toBeLessThan(1e-3);
    }
    // The field is non-constant: neighbouring lattice points differ.
    const here = noise(0, 0, 0);
    const neighbour = noise(1, 0, 0);
    expect(here).not.toBe(neighbour);
  });
});
