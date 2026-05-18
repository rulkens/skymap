/**
 * applyLuminanceAsAlpha — unit tests.
 *
 * Computes Rec 709 luma per pixel, maps it through a (blackPoint,
 * whitePoint, gamma) curve, and MULTIPLIES the result into the existing
 * alpha channel.  The "multiply, don't overwrite" detail matters: callers
 * may have already applied a radial fade or a sky-cut, and the luminance
 * pass should refine that mask, not erase it.
 */

import { describe, expect, it } from 'vitest';
import { applyLuminanceAsAlpha } from '../../../../tools/utils/image/applyLuminanceAsAlpha';

/** Build a 2×2 RGBA buffer with explicit per-pixel values. */
function buf2x2(pixels: ReadonlyArray<[number, number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => {
    out[i * 4 + 0] = p[0];
    out[i * 4 + 1] = p[1];
    out[i * 4 + 2] = p[2];
    out[i * 4 + 3] = p[3];
  });
  return out;
}

describe('applyLuminanceAsAlpha', () => {
  it('drives alpha to 0 for pixels at or below blackPoint', () => {
    // Pure black + a near-black pixel (luma 5).  Both should clamp to alpha 0.
    const buf = buf2x2([
      [0, 0, 0, 255],
      [5, 5, 5, 255],
      [0, 0, 0, 255],
      [5, 5, 5, 255],
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 8, whitePoint: 255, gamma: 1 });
    expect(buf[3]).toBe(0);
    expect(buf[7]).toBe(0);
    expect(buf[11]).toBe(0);
    expect(buf[15]).toBe(0);
  });

  it('drives alpha to 255 for pixels at or above whitePoint', () => {
    // Pure white at whitePoint 200 → alpha stays at the incoming 255.
    const buf = buf2x2([
      [255, 255, 255, 255],
      [200, 200, 200, 255],
      [220, 220, 220, 255],
      [255, 255, 255, 255],
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 0, whitePoint: 200, gamma: 1 });
    expect(buf[3]).toBe(255);
    expect(buf[7]).toBe(255);
    expect(buf[11]).toBe(255);
    expect(buf[15]).toBe(255);
  });

  it('uses Rec 709 luma weights (green dominates)', () => {
    // Equal-magnitude single-channel pixels: red, green, blue at value 200.
    // Rec 709: Y = 0.2126*R + 0.7152*G + 0.0722*B.
    // So green should produce the highest alpha, blue the lowest.
    const buf = buf2x2([
      [200, 0, 0, 255], // red
      [0, 200, 0, 255], // green
      [0, 0, 200, 255], // blue
      [0, 0, 0, 255],   // black control
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 0, whitePoint: 255, gamma: 1 });
    const alphaRed = buf[3]!;
    const alphaGreen = buf[7]!;
    const alphaBlue = buf[11]!;
    expect(alphaGreen).toBeGreaterThan(alphaRed);
    expect(alphaRed).toBeGreaterThan(alphaBlue);
  });

  it('multiplies into the existing alpha (does not overwrite)', () => {
    // Existing alpha 128 (half-transparent), pixel luma well above
    // whitePoint → alpha-curve produces 1.0 → 1.0 * 128 = 128.
    const buf = buf2x2([
      [255, 255, 255, 128],
      [255, 255, 255, 128],
      [255, 255, 255, 128],
      [255, 255, 255, 128],
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 0, whitePoint: 200, gamma: 1 });
    expect(buf[3]).toBe(128);
    expect(buf[7]).toBe(128);
    expect(buf[11]).toBe(128);
    expect(buf[15]).toBe(128);
  });

  it('applies gamma after the black/white remap (gamma < 1 brightens)', () => {
    // Mid-grey 128, blackPoint 0, whitePoint 255 → normalised t = 128/255 ≈ 0.502.
    // gamma 0.5 → pow(0.502, 0.5) ≈ 0.708 → alpha ≈ 180.
    // gamma 1.0 → ≈ 128.
    const bufG05 = buf2x2([[128, 128, 128, 255]]);
    const bufG10 = buf2x2([[128, 128, 128, 255]]);
    applyLuminanceAsAlpha(bufG05, 1, 1, { blackPoint: 0, whitePoint: 255, gamma: 0.5 });
    applyLuminanceAsAlpha(bufG10, 1, 1, { blackPoint: 0, whitePoint: 255, gamma: 1 });
    expect(bufG05[3]!).toBeGreaterThan(bufG10[3]!);
    expect(bufG05[3]!).toBeGreaterThan(170);
    expect(bufG05[3]!).toBeLessThan(190);
  });
});
