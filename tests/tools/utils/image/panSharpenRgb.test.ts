/**
 * The pan-sharpen recombination's load-bearing properties: where each output
 * component's information comes from, that the chroma source's exposure cannot
 * leak into the result, that the luminance survives an arbitrary calibration
 * untouched, and that the matrix is applied in the basis and orientation the
 * fitted coefficients assume (a transposed matrix, or a differently-rotated
 * basis of the same plane, reads as a plausible colour and is otherwise
 * invisible).
 */

import { describe, expect, it } from 'vitest';

import type { ChromaCalibration } from '../../../../src/@types/scene/ChromaCalibration';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { panSharpenRgb } from '../../../../tools/utils/image/panSharpenRgb';

const LUM: Vec3 = [0.2126, 0.7152, 0.0722];
const decode = (v: number): number =>
  v / 255 <= 0.04045 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4);
const encode = (linear: number): number =>
  Math.round(
    255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055),
  );

/** The chroma-plane basis the calibration's coefficients are expressed in. */
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
const E1 = unit([1, 0, -LUM[0] / LUM[2]]);
const E2 = (() => {
  const seed: Vec3 = [0, 1, -LUM[1] / LUM[2]];
  const d = seed[0] * E1[0] + seed[1] * E1[1] + seed[2] * E1[2];
  return unit([seed[0] - d * E1[0], seed[1] - d * E1[1], seed[2] - d * E1[2]]);
})();

/** `c`'s coordinates in that basis, for an 8-bit sRGB triple. */
function project(rgb: readonly [number, number, number]): [number, number] {
  const lin = rgb.map(decode) as Vec3;
  const y = LUM[0] * lin[0] + LUM[1] * lin[1] + LUM[2] * lin[2];
  const c = lin.map((v) => v / y - 1) as Vec3;
  return [c[0] * E1[0] + c[1] * E1[1] + c[2] * E1[2], c[0] * E2[0] + c[1] * E2[1] + c[2] * E2[2]];
}

/** A warm, off-neutral chroma pixel: both plane coordinates are non-zero. */
const WARM: readonly [number, number, number] = [210, 170, 120];

describe('panSharpenRgb', () => {
  it('takes luminance from the panchromatic source and hue from the chroma source', () => {
    const zeroed: ChromaCalibration = {
      matrix: [
        [0, 0],
        [0, 0],
      ],
      gain: 1,
    };
    const out = panSharpenRgb(
      Uint8Array.from([90, 200]),
      Uint8Array.from([...WARM, ...WARM]),
      zeroed,
    );
    // Zeroed chroma leaves pure luminance: each pixel is its panchromatic byte,
    // grey. A build that passed the chroma source's own brightness through would
    // give two identical pixels instead.
    expect([...out]).toEqual([90, 90, 90, 200, 200, 200]);
  });

  it('is invariant to how brightly the chroma source was exposed', () => {
    const identity: ChromaCalibration = {
      matrix: [
        [1, 0],
        [0, 1],
      ],
      gain: 1,
    };
    // The same hue at half the linear exposure — a straight RGB multiply of the
    // two sources would darken the second result; Y-normalised chroma does not.
    const dim = WARM.map((v) => encode(decode(v) / 2)) as [number, number, number];
    const bright = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(WARM), identity);
    const dimmed = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(dim), identity);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(bright[i]! - dimmed[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it('leaves the panchromatic luminance untouched under any calibration', () => {
    // The reason chroma is carried as RGB/Y - 1 at all: whatever the matrix does,
    // the result stays in the plane orthogonal to LUM, so the pan source's detail
    // is never re-shaded by the colour map.
    const calibration: ChromaCalibration = {
      matrix: [
        [1.0354, 0.3565],
        [-0.0686, 0.1579],
      ],
      gain: 0.958,
    };
    const out = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(WARM), calibration);
    const y = LUM[0] * decode(out[0]!) + LUM[1] * decode(out[1]!) + LUM[2] * decode(out[2]!);
    expect(y).toBeCloseTo(decode(160), 3);
  });

  it('applies the matrix as a column-vector multiply in the fitted chroma basis', () => {
    // Deliberately asymmetric: a transposed matrix, or a different orthonormal
    // basis of the same plane, changes the answer. The basis is re-derived above
    // from the luminance weights because it IS the contract the coefficients
    // carry — nothing else in the suite pins it.
    const calibration: ChromaCalibration = {
      matrix: [
        [0.5, 0.25],
        [0, 0],
      ],
      gain: 0.8,
    };
    const [p0, p1] = project(WARM);
    const out = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(WARM), calibration);
    const [q0, q1] = project([out[0]!, out[1]!, out[2]!]);

    expect(q0).toBeCloseTo(0.8 * (0.5 * p0 + 0.25 * p1), 2);
    expect(q1).toBeCloseTo(0, 2);
  });
});
