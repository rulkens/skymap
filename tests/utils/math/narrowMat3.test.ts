/**
 * narrowMat3 — the GPU-boundary narrow contract.
 *
 * Like `narrowMat4`, the load-bearing property is the byte-for-byte layout the
 * shader reads: a `mat3x3<f32>` is std140-padded to 12 floats (three vec4-
 * aligned columns), so the narrow must PRESERVE length 12 and every column
 * offset, coercing each f64 lane to its nearest f32. A test guards that the
 * narrow is a pure length-preserving f32 copy (not, say, a 9-element repack
 * that would silently corrupt the column stride on upload).
 */

import { describe, expect, it } from 'vitest';

import { narrowMat3 } from '../../../src/utils/math/narrowMat3';

describe('narrowMat3', () => {
  it('preserves the 12-element padded layout under f32 rounding', () => {
    // A padded mat3d: three columns of three values + a padding lane each.
    // 0.1 is not exactly representable in f32, so this also proves the values
    // are actually narrowed, not passed through as f64.
    const src = new Float64Array([
      1.1,
      2.2,
      3.3,
      0, // col 0 (+ pad)
      4.4,
      5.5,
      6.6,
      0, // col 1 (+ pad)
      7.7,
      8.8,
      9.9,
      0, // col 2 (+ pad)
    ]);

    const narrowed = narrowMat3(src);

    expect(narrowed).toBeInstanceOf(Float32Array);
    expect(narrowed.length).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(narrowed[i]).toBe(Math.fround(src[i]!));
    }
  });
});
