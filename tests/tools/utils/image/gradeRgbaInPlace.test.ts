import { describe, expect, it } from 'vitest';

import type { ColourGrade } from '../../../../src/@types/scene/ColourGrade';
import { gradeRgbaInPlace } from '../../../../tools/utils/image/gradeRgbaInPlace';

const IDENTITY: ColourGrade = {
  ev: 0,
  contrast: 1,
  gamma: 1,
  saturation: 1,
  gain: [1, 1, 1],
  offset: [0, 0, 0],
};

describe('gradeRgbaInPlace', () => {
  it('leaves bytes unchanged under the identity grade', () => {
    const rgba = new Uint8Array([10, 20, 30, 255, 200, 150, 100, 0]);
    const before = new Uint8Array(rgba);
    gradeRgbaInPlace(rgba, IDENTITY);
    expect(rgba).toEqual(before);
  });

  it('matches a hand-computed pixel: full desaturation collapses to luma', () => {
    // Pure red at 0.2126 Rec.709 weight: y = 0.2126, byte = round(0.2126*255) = 54.
    const rgba = new Uint8Array([255, 0, 0, 128]);
    gradeRgbaInPlace(rgba, { ...IDENTITY, saturation: 0 });
    expect(Array.from(rgba)).toEqual([54, 54, 54, 128]);
  });

  it('scales an overflowing pixel down across all channels, keeping its hue', () => {
    // Red gain 2 on (200, 100, 50): r = 1.569 → all three divided by it.
    const rgba = new Uint8Array([200, 100, 50, 255]);
    gradeRgbaInPlace(rgba, { ...IDENTITY, gain: [2, 1, 1] });
    expect(Array.from(rgba)).toEqual([255, 64, 32, 255]);
  });

  it('skips a no-data (alpha-0) pixel entirely, even under a non-identity grade', () => {
    const rgba = new Uint8Array([12, 34, 56, 0]);
    gradeRgbaInPlace(rgba, { ...IDENTITY, ev: 2, contrast: 1.5, saturation: 0 });
    expect(Array.from(rgba)).toEqual([12, 34, 56, 0]);
  });
});
