/**
 * smoothEquirectSphere.test.ts — the two properties the shell bake depends
 * on. Median-then-mean resolves a two-valued step (the fit jumping between
 * candidate dust walls) to one side, not the empty middle. NaN healing is
 * the second: upstream ships failed sight lines a kernel must not propagate.
 */
import { describe, expect, it } from 'vitest';

import { smoothEquirectSphere } from '../../../../tools/utils/geo/smoothEquirectSphere';

const W = 64;
const H = 32;

describe('smoothEquirectSphere', () => {
  it('does not invent a mid-value across a two-valued step', () => {
    const plane = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) plane[y * W + x] = x < W / 2 ? 100 : 500;
    }
    const out = smoothEquirectSphere(plane, W, H, 3);

    // Well away from the seam, the median must still hold its own side.
    const left = out[16 * W + 8]!;
    const right = out[16 * W + 56]!;
    expect(left).toBeCloseTo(100, 0);
    expect(right).toBeCloseTo(500, 0);
  });

  it('heals isolated non-finite texels from their neighbours', () => {
    const plane = new Float32Array(W * H).fill(200);
    plane[16 * W + 32] = NaN;
    const out = smoothEquirectSphere(plane, W, H, 3);

    expect(Number.isFinite(out[16 * W + 32]!)).toBe(true);
    expect(out[16 * W + 32]).toBeCloseTo(200, 3);
  });

  it('drops an isolated outlier rather than smearing it', () => {
    const plane = new Float32Array(W * H).fill(200);
    plane[16 * W + 32] = 4000;
    const out = smoothEquirectSphere(plane, W, H, 6);

    // The median pass is what earns this: a mean-only kernel would spread the
    // spike across its whole footprint instead of discarding it.
    expect(out[16 * W + 32]).toBeCloseTo(200, 3);
  });

  it('wraps the kernel across the longitude seam', () => {
    const plane = new Float32Array(W * H).fill(200);
    // A BLOCK, not a spike: the median is meant to discard lone outliers, so a
    // single texel would test nothing about wrapping.
    for (let y = 0; y < H; y++) for (let x = W - 5; x < W; x++) plane[y * W + x] = 400;
    const out = smoothEquirectSphere(plane, W, H, 11.25);

    // Without the wrap, column 0's kernel sees only its own side — still 200.
    expect(out[16 * W]!).toBeGreaterThan(200);
  });
});
