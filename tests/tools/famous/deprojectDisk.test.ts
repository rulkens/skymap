/**
 * Tests for deprojectDisk — pure affine minor-axis stretch.
 *
 * Each test creates a fresh Sharp pipeline from an in-memory buffer.
 * A Sharp pipeline is single-use; never share across assertions.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { deprojectDisk, willDeproject } from '../../../tools/famous/deprojectDisk';

const W = 100;
const H = 100;
const CHANNELS = 4;

/** Build a fresh Sharp from a flat RGBA buffer filled with a constant value. */
function makeSrc(fillValue = 128): ReturnType<typeof sharp> {
  const buf = Buffer.alloc(W * H * CHANNELS, fillValue);
  return sharp(buf, { raw: { width: W, height: H, channels: CHANNELS } });
}

describe('deprojectDisk', () => {
  it('is identity at axisRatio = 1 — dimensions and a sampled pixel are unchanged', async () => {
    const src = makeSrc(200);
    const result = deprojectDisk(src, { paDeg: 0, axisRatio: 1 });
    const { data, info } = await result.raw().toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(W);
    expect(info.height).toBe(H);
    // Fill value is preserved (sample first and last pixel).
    expect(data[0]).toBe(200);
    expect(data[data.length - CHANNELS]).toBe(200);
  });

  it('stretches the minor axis (image-Y) for paDeg=0, axisRatio=0.5 — height ≈ 2×', async () => {
    // paDeg = 0: major axis is image-X, minor axis is image-Y.
    // s = 1/0.5 = 2, so M = [[1,0],[0,2]] — height doubles, width unchanged.
    const src = makeSrc();
    const result = deprojectDisk(src, { paDeg: 0, axisRatio: 0.5 });
    const { info } = await result.png().toBuffer({ resolveWithObject: true });

    expect(info.width).toBeGreaterThanOrEqual(W - 2);
    expect(info.width).toBeLessThanOrEqual(W + 2);
    expect(info.height).toBeGreaterThanOrEqual(H * 2 - 2);
    expect(info.height).toBeLessThanOrEqual(H * 2 + 2);
  });

  it('stretches along the rotated minor axis for paDeg=90 — width ≈ 2×, height unchanged', async () => {
    // paDeg = 90: major axis is image-Y, minor axis is image-X.
    // s = 1/0.5 = 2, so M = [[2,0],[0,1]] — width doubles, height unchanged.
    const src = makeSrc();
    const result = deprojectDisk(src, { paDeg: 90, axisRatio: 0.5 });
    const { info } = await result.png().toBuffer({ resolveWithObject: true });

    expect(info.width).toBeGreaterThanOrEqual(W * 2 - 2);
    expect(info.width).toBeLessThanOrEqual(W * 2 + 2);
    expect(info.height).toBeGreaterThanOrEqual(H - 2);
    expect(info.height).toBeLessThanOrEqual(H + 2);
  });

  it('still deprojects a very edge-on disk (axisRatio=0.2) when forced', async () => {
    // The old hard floor (DEPROJECT_MIN_AXIS_RATIO=0.3) is now advisory: a
    // tilted, valid disk (0 < b/a < 1) always stretches.  paDeg=0, axisRatio=0.2
    // → s = 1/0.2 = 5, so M = [[1,0],[0,5]] — height grows ~5×, width unchanged.
    const src = makeSrc();
    const result = deprojectDisk(src, { paDeg: 0, axisRatio: 0.2 });
    const { info } = await result.png().toBuffer({ resolveWithObject: true });

    expect(info.width).toBeGreaterThanOrEqual(W - 2);
    expect(info.width).toBeLessThanOrEqual(W + 2);
    expect(info.height).toBeGreaterThanOrEqual(H * 5 - 5);
    expect(info.height).toBeLessThanOrEqual(H * 5 + 5);
  });
});

describe('willDeproject', () => {
  it('is true for a very edge-on but valid disk (now advisory, not a floor)', () => {
    expect(willDeproject(0.2)).toBe(true);
  });

  it('is true for a mid-range tilted disk', () => {
    expect(willDeproject(0.5)).toBe(true);
  });

  it('is false at face-on (axisRatio = 1)', () => {
    expect(willDeproject(1)).toBe(false);
  });

  it('is false for an over-round axis ratio (> 1)', () => {
    expect(willDeproject(1.2)).toBe(false);
  });

  it('is false for invalid data (axisRatio = 0)', () => {
    expect(willDeproject(0)).toBe(false);
  });
});
