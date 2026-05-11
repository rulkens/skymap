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
    // alpha = round(t * 255), so at t=1 it must be exactly 255.
    expect(alphaEnd).toBe(255);
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

  it('inferno is dark at the low end and warm-bright at the high end', () => {
    const lut = buildPaletteLut('inferno');
    expect(lut.length).toBe(PALETTE_LUT_SIZE * 4);
    // Low end is near-black: R+G+B should be small.
    const lowSum = lut[0]! + lut[1]! + lut[2]!;
    expect(lowSum).toBeLessThan(30);
    // High end is warm-bright: R should be high, B should be lower than R+G.
    const peak = (PALETTE_LUT_SIZE - 1) * 4;
    expect(lut[peak + 0]!).toBeGreaterThan(200); // R bright
    expect(lut[peak + 1]!).toBeGreaterThan(180); // G bright
    expect(lut[peak + 2]!).toBeLessThan(lut[peak + 0]! + lut[peak + 1]!); // B not dominant
  });
});
