/**
 * swizzleToRgba — the readback-to-RGBA conversion from the `grab` screenshot
 * path. Pins the two failure modes a wrong index or missing swap would cause
 * silently: BGRA channel order and stripped row padding.
 */
import { describe, expect, it } from 'vitest';
import { swizzleToRgba } from '../../../../../tools/galaxy-renderer/src/engine/probe/swizzleToRgba';

describe('swizzleToRgba', () => {
  it('swaps R and B under bgra, and strips row padding', () => {
    const size = 2;
    const paddedBytesPerRow = 32; // > size * 4 (8), so padding must be skipped
    const src = new Uint8Array(paddedBytesPerRow * size);
    // row 0: two BGRA texels (10,20,30) and (40,50,60), plus padding bytes
    src.set([30, 20, 10, 255, 60, 50, 40, 255], 0);
    // row 1, offset by the padded stride, not size * 4
    src.set([90, 80, 70, 255, 120, 110, 100, 255], paddedBytesPerRow);

    const out = swizzleToRgba(src, paddedBytesPerRow, size, true);

    expect(Array.from(out)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
    ]);
  });

  it('leaves channel order alone when the format is not bgra', () => {
    const size = 2;
    const paddedBytesPerRow = 32;
    const src = new Uint8Array(paddedBytesPerRow * size);
    src.set([10, 20, 30, 255, 40, 50, 60, 255], 0);
    src.set([70, 80, 90, 255, 100, 110, 120, 255], paddedBytesPerRow);

    const out = swizzleToRgba(src, paddedBytesPerRow, size, false);

    expect(Array.from(out)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
    ]);
  });
});
