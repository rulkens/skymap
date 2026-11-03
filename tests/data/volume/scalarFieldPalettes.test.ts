import { describe, it, expect } from 'vitest';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../src/data/volume/scalarFieldPalettes';

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
    // alpha = round(t * 255), so at t=1 it must be exactly 255.
    expect(alphaEnd).toBe(255);
  });

  it('throws on unknown palette id', () => {
    // @ts-expect-error — testing the runtime guard
    expect(() => buildPaletteLut('does-not-exist')).toThrow(/palette/i);
  });
});
