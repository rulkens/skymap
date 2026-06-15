import { describe, it, expect } from 'vitest';
import { reorthonormalise } from '../../../src/utils/math/reorthonormalise';
import type { Mat3 } from '../../../src/@types/math/Mat3';

// Column dot products of a perfectly-orthonormal matrix are exactly zero.
function maxColumnDot(m: Mat3): number {
  const cols: number[][] = [
    [m[0]!, m[1]!, m[2]!],
    [m[3]!, m[4]!, m[5]!],
    [m[6]!, m[7]!, m[8]!],
  ];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return Math.max(
    Math.abs(dot(cols[0]!, cols[1]!)),
    Math.abs(dot(cols[0]!, cols[2]!)),
    Math.abs(dot(cols[1]!, cols[2]!)),
  );
}

describe('reorthonormalise', () => {
  it('leaves the identity unchanged', () => {
    const m: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const r = reorthonormalise(m);
    for (let i = 0; i < 9; i++) expect(r[i]).toBeCloseTo(m[i]!, 12);
  });

  it('normalises columns to unit length', () => {
    const m: Mat3 = [2, 0, 0, 0, 3, 0, 0, 0, 4];
    const r = reorthonormalise(m);
    expect(Math.hypot(r[0]!, r[1]!, r[2]!)).toBeCloseTo(1, 12);
    expect(Math.hypot(r[3]!, r[4]!, r[5]!)).toBeCloseTo(1, 12);
    expect(Math.hypot(r[6]!, r[7]!, r[8]!)).toBeCloseTo(1, 12);
  });

  it('pulls a slightly-skewed near-rotation back onto the orthonormal manifold', () => {
    // Perturb the identity's second column out of orthogonality.
    const m: Mat3 = [1, 0, 0, 1e-3, 1, 0, 0, 0, 1];
    expect(maxColumnDot(m)).toBeGreaterThan(1e-4);
    const r = reorthonormalise(m);
    expect(maxColumnDot(r)).toBeLessThan(1e-12);
  });
});
