import { describe, it, expect } from 'vitest';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../src/data/scalarFieldPalettes';

describe('scalar field palettes', () => {
  it('produces a 256×4 RGBA8 LUT', () => {
    const lut = buildPaletteLut('viridis');
    expect(lut.length).toBe(PALETTE_LUT_SIZE * 4);
    expect(lut).toBeInstanceOf(Uint8Array);
  });

  it('starts dark and ends bright for viridis (luminance monotonic-ish)', () => {
    const lut = buildPaletteLut('viridis');
    const alphaStart = lut[3]!;
    const alphaEnd = lut[(PALETTE_LUT_SIZE - 1) * 4 + 3]!;
    expect(alphaStart).toBeLessThan(alphaEnd);
    expect(alphaEnd).toBeGreaterThan(200); // basically opaque at peak
  });

  it('blue-purple has higher B than R at the low end', () => {
    const lut = buildPaletteLut('blue-purple');
    const mid = (PALETTE_LUT_SIZE / 4) * 4;
    expect(lut[mid + 2]!).toBeGreaterThan(lut[mid + 0]!);
  });

  it('yellow-green peaks have R+G high and B low', () => {
    const lut = buildPaletteLut('yellow-green');
    const peak = (PALETTE_LUT_SIZE - 1) * 4;
    expect(lut[peak + 0]! + lut[peak + 1]!).toBeGreaterThan(lut[peak + 2]! * 2);
  });

  it('throws on unknown palette id', () => {
    // @ts-expect-error — testing the runtime guard
    expect(() => buildPaletteLut('does-not-exist')).toThrow(/palette/i);
  });
});
