/**
 * The pan-sharpen recombination's load-bearing properties: where each output
 * component's information comes from, that the chroma source's exposure cannot
 * leak into the result, that the matrix lands in the basis and orientation the
 * fitted coefficients assume (a transposed matrix, or a differently-rotated
 * basis of the same plane, reads as a plausible colour and is otherwise
 * invisible), and where the luminance guarantee stops.
 *
 * Expected bytes are frozen from a derivation of the maths written independently
 * of the source; nothing here re-derives the basis or the transfer curve, since
 * a re-derivation moves with whatever bug it is supposed to catch.
 */

import { describe, expect, it } from 'vitest';

import type { ChromaCalibration } from '../../../../src/@types/scene/ChromaCalibration';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { panSharpenRgb } from '../../../../tools/utils/image/panSharpenRgb';

/** Rec.709 weights and the published sRGB EOTF, used only to READ an output. */
const LUM: Vec3 = [0.2126, 0.7152, 0.0722];
const srgbToLinear = (byte: number): number => {
  const v = byte / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminanceOf = (rgb: Buffer): number =>
  LUM[0] * srgbToLinear(rgb[0]!) + LUM[1] * srgbToLinear(rgb[1]!) + LUM[2] * srgbToLinear(rgb[2]!);

/** A warm, off-neutral chroma pixel: both plane coordinates are non-zero. */
const WARM: readonly [number, number, number] = [210, 170, 120];

/** Saturated enough that a bright pan luminance drives the result out of gamut. */
const VIVID: readonly [number, number, number] = [255, 60, 30];

/** The Pluto fit — anisotropic enough that its orientation is observable. */
const SHIPPED: ChromaCalibration = {
  matrix: [
    [1.0354, 0.3565],
    [-0.0686, 0.1579],
  ],
  gain: 0.958,
};

const IDENTITY: ChromaCalibration = {
  matrix: [
    [1, 0],
    [0, 1],
  ],
  gain: 1,
};

const ASYMMETRIC: ChromaCalibration = {
  matrix: [
    [0.5, 0.25],
    [0, 0],
  ],
  gain: 0.8,
};

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
    // [154, 124, 86] is WARM at half the linear exposure. A straight RGB
    // multiply of the two sources would darken the second result; Y-normalised
    // chroma does not.
    const dim: readonly [number, number, number] = [154, 124, 86];
    const bright = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(WARM), IDENTITY);
    const dimmed = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(dim), IDENTITY);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(bright[i]! - dimmed[i]!)).toBeLessThanOrEqual(2);
    }
  });

  // The first case is the orientation probe: transposing the matrix gives
  // [157, 163, 136] and rotating the basis gives [158, 161, 159], both plausible.
  it.each([
    {
      name: 'asymmetric matrix, in gamut',
      lum: 160,
      chroma: WARM,
      calibration: ASYMMETRIC,
      expected: [165, 160, 144],
    },
    {
      name: 'the shipped Pluto calibration',
      lum: 160,
      chroma: WARM,
      calibration: SHIPPED,
      expected: [178, 158, 113],
    },
    {
      name: 'saturated chroma driven out of gamut',
      lum: 240,
      chroma: VIVID,
      calibration: IDENTITY,
      expected: [255, 111, 61],
    },
  ])(
    'reproduces the independently derived bytes — $name',
    ({ lum, chroma, calibration, expected }) => {
      const out = panSharpenRgb(Uint8Array.from([lum]), Uint8Array.from(chroma), calibration);
      expect([...out]).toEqual(expected);
    },
  );

  it('leaves the panchromatic luminance untouched while the result stays in gamut', () => {
    // The reason chroma is carried as RGB/Y - 1 at all: whatever the matrix does,
    // the result stays in the plane orthogonal to LUM, so the pan source's detail
    // is never re-shaded by the colour map.
    const out = panSharpenRgb(Uint8Array.from([160]), Uint8Array.from(WARM), SHIPPED);
    expect(luminanceOf(out)).toBeCloseTo(srgbToLinear(160), 3);
  });

  it('loses that luminance where the gamut clamp fires', () => {
    // The clamp is the only breach of the invariant above, and it is not small
    // where it fires: here the pan luminance comes out 62% low. On Pluto's
    // shipped 4096x2048 pair it hits 0.103% of pixels, up to 79% error.
    const out = panSharpenRgb(Uint8Array.from([240]), Uint8Array.from(VIVID), IDENTITY);
    expect(luminanceOf(out) / srgbToLinear(240)).toBeCloseTo(0.378, 2);
  });
});
