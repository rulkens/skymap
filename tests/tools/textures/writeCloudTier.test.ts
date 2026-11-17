import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { writeCloudTier } from '../../../tools/textures/writeCloudTier';

describe('writeCloudTier', () => {
  // The runtime reads coverage from one raw channel; a coloured or inverted
  // output would tint the deck or swap cloud and sky.
  it('writes a single grey channel at the tier width', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'writeCloudTier-'));
    try {
      const srcPath = join(dir, 'src.png');
      const outPath = join(dir, 'out.webp');
      const srcPx = 64;
      const tierPx = 32;

      // Left half white cloud, right half black sky, as RGB with no alpha.
      const rgb = Buffer.alloc(srcPx * (srcPx / 2) * 3);
      for (let y = 0; y < srcPx / 2; y++) {
        for (let x = 0; x < srcPx / 2; x++)
          rgb.fill(255, (y * srcPx + x) * 3, (y * srcPx + x) * 3 + 3);
      }
      await sharp(rgb, { raw: { width: srcPx, height: srcPx / 2, channels: 3 } })
        .png()
        .toFile(srcPath);

      await writeCloudTier(srcPath, tierPx, outPath);

      const { data, info } = await sharp(outPath).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(tierPx);
      expect(info.height).toBe(tierPx / 2);
      const at = (x: number, y: number, c: number): number =>
        data[(y * info.width + x) * info.channels + c]!;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          expect(at(x, y, 1)).toBe(at(x, y, 0));
          expect(at(x, y, 2)).toBe(at(x, y, 0));
        }
      }
      expect(at(4, 4, 0)).toBeGreaterThanOrEqual(252);
      expect(at(tierPx - 5, 4, 0)).toBeLessThanOrEqual(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
