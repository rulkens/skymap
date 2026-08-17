import { describe, expect, it } from 'vitest';
import { hexToLinearRgb } from '../../../src/utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../../src/utils/color/linearRgbToHex';

describe('hexToLinearRgb', () => {
  it('maps sRGB black and white to linear 0 and 1', () => {
    expect(hexToLinearRgb('#000000')).toEqual([0, 0, 0]);
    const [r, g, b] = hexToLinearRgb('#ffffff');
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(1, 5);
  });

  it('maps the sRGB mid-grey anchor point to ~0.2140 linear', () => {
    // #808080 ≈ sRGB 0.5019..., whose linear equivalent is the textbook
    // "18% grey card" anchor (~0.214), not the naive 0.5.
    const [r, g, b] = hexToLinearRgb('#808080');
    expect(r).toBeCloseTo(0.214, 2);
    expect(g).toBeCloseTo(0.214, 2);
    expect(b).toBeCloseTo(0.214, 2);
  });

  it('round-trips every 8-bit channel value through linearRgbToHex', () => {
    for (let byte = 0; byte <= 255; byte++) {
      const hex = `#${byte.toString(16).padStart(2, '0').repeat(3)}` as const;
      const linear = hexToLinearRgb(hex);
      expect(linearRgbToHex(linear)).toBe(hex);
    }
  });

  it('rejects malformed hex strings', () => {
    expect(() => hexToLinearRgb('#fff')).toThrow();
    expect(() => hexToLinearRgb('#gggggg')).toThrow();
  });
});
