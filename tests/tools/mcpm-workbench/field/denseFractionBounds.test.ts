/**
 * denseFractionBounds — fraction=1 must reproduce catalogBounds bit-for-bit
 * (both fold the same min/max over the same points, just via a different
 * rank order), shrinking the kept fraction must never grow the box back,
 * and a zero-IQR axis must not poison the rank with NaN.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { denseFractionBounds } from '../../../../tools/mcpm-workbench/src/field/denseFractionBounds';
import { catalogBounds } from '../../../../tools/mcpm-workbench/src/field/catalogBounds';

function randomPositions(n: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (rng() - 0.5) * 200;
  return positions;
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

describe('denseFractionBounds', () => {
  it('fraction=1 reproduces catalogBounds bit-for-bit on random data', () => {
    const positions = randomPositions(500, 12345);
    const bounds = denseFractionBounds(positions, 500, 1);
    const expected = catalogBounds(positions);
    expect(bounds).toEqual(expected);
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
    const bounds = denseFractionBounds(positions, n, 0.5)!;
    for (const v of [...bounds.min, ...bounds.max]) expect(Number.isNaN(v)).toBe(false);
  });

  it('shrinks monotonically as the kept fraction drops, excluding the far stragglers', () => {
    const positions = clusterWithStragglers();
    const count = positions.length / 3;

    const extents = [1, 0.95, 0.9, 0.8].map((fraction) => {
      const { min, max } = denseFractionBounds(positions, count, fraction)!;
      return max[0] - min[0];
    });
    for (let i = 1; i < extents.length; i++) {
      expect(extents[i]).toBeLessThanOrEqual(extents[i - 1]!);
    }
    // At 0.95 the stragglers (±500+ Mpc) are already gone, well inside their footprint.
    const fitted = denseFractionBounds(positions, count, 0.95)!;
    for (const v of [...fitted.min, ...fitted.max]) expect(Math.abs(v)).toBeLessThan(2);
  });
});
