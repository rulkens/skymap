/**
 * cropExtract — rotated / out-of-image-aware crop helper.
 *
 * Covers:
 *   - rotation=0, in-bounds → byte-equivalent to plain sharp().extract
 *   - rotation=0, out-of-bounds → transparent pad in the overflow region
 *   - rotation=90, in-bounds → 90-CCW axis swap visible in pixel layout
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { rotatedExtract } from '../../../tools/famous-curator/plugin/cropExtract';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Build a synthetic test image: red top-left quadrant, green top-right,
 * blue bottom-left, white bottom-right.  Lets us check pixel layout
 * after rotation without depending on a real galaxy fixture.
 */
async function quadrantImage(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'crop-extract-test-'));
  const path = join(dir, 'src.png');
  const w = 100;
  const h = 100;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const left = x < w / 2;
      const top = y < h / 2;
      data[i] = left && top ? 255 : top ? 0 : !left && !top ? 255 : 0; // R
      data[i + 1] = !left && top ? 255 : 0;                              // G
      data[i + 2] = left && !top ? 255 : !left && !top ? 255 : 0;        // B
      data[i + 3] = 255;                                                  // A
    }
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
  writeFileSync(path, png);
  return path;
}

describe('rotatedExtract', () => {
  it('rotation=0, in-bounds → equivalent to plain sharp().extract', async () => {
    const src = await quadrantImage();
    const baseline = await sharp(src)
      .extract({ left: 10, top: 10, width: 40, height: 40 })
      .png()
      .toBuffer();
    const pipeline = await rotatedExtract(src, {
      x: 10, y: 10, width: 40, height: 40, rotationDeg: 0,
    });
    const result = await pipeline.png().toBuffer();
    expect(result.equals(baseline)).toBe(true);
  });

  it('rotation=0, crop extends off the left → transparent padding fills the overflow', async () => {
    const src = await quadrantImage();
    // x=-20 means the leftmost 20px of the extract is outside the image.
    const pipeline = await rotatedExtract(src, {
      x: -20, y: 10, width: 40, height: 40, rotationDeg: 0,
    });
    const { data, info } = await pipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(40);
    expect(info.height).toBe(40);
    // First column (x=0 in the output) is at source-x=-20 → out of bounds.
    expect(data[3]).toBe(0); // alpha at (0, 0) is 0
    // Column 20 of output is at source-x=0 → in bounds, opaque.
    const opaqueIdx = (0 * 40 + 20) * 4 + 3;
    expect(data[opaqueIdx]).toBe(255);
  });

  it('rotation=90 swaps the visible quadrant layout', async () => {
    const src = await quadrantImage();
    // Source: red top-left, green top-right, blue bottom-left, white bottom-right.
    // Extract a 50×50 crop at (25, 25, w=50, h=50) — the central square,
    // covering parts of all four quadrants.  At rotation=0 the layout is
    // (red, green) over (blue, white); at rotation=90 (CW), the layout
    // becomes (blue, red) over (white, green).
    const unrotated = await rotatedExtract(src, {
      x: 25, y: 25, width: 50, height: 50, rotationDeg: 0,
    });
    const ub = await unrotated.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const topLeftUnrotated = [ub.data[0], ub.data[1], ub.data[2]];
    expect(topLeftUnrotated).toEqual([255, 0, 0]); // red

    const rotated = await rotatedExtract(src, {
      x: 25, y: 25, width: 50, height: 50, rotationDeg: 90,
    });
    const rb = await rotated.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const topLeftRotated = [rb.data[0], rb.data[1], rb.data[2]];
    // sharp.rotate(-90) is CCW 90 visually.  The original top-RIGHT (green)
    // rotates into the new top-left position.
    expect(topLeftRotated).toEqual([0, 255, 0]); // green
  });
});
