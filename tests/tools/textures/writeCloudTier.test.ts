import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { writeCloudTier } from '../../../tools/textures/writeCloudTier';

describe('writeCloudTier', () => {
  // The cloud composite ships white-cloud-on-black with NO alpha channel, so the
  // build must DERIVE alpha from luminance: a white cloud pixel becomes opaque,
  // a black sky pixel becomes fully transparent, while the RGB colour is kept.
  // Fails if the luminance->alpha derivation is dropped (uniform opaque) or
  // inverted (clouds vanish, sky opaque) — a real property, spec §9.1.
  it('derives alpha from luminance when the source has none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'writeCloudTier-'));
    try {
      const srcPath = join(dir, 'src.png');
      const outPath = join(dir, 'out.png');

      // A 2x1 RGB source (no alpha): a white cell then a black cell.
      const rgb = Buffer.from([255, 255, 255, 0, 0, 0]);
      await sharp(rgb, { raw: { width: 2, height: 1, channels: 3 } })
        .png()
        .toFile(srcPath);

      await writeCloudTier(srcPath, 2, outPath);

      const out = await sharp(outPath).raw().toBuffer({ resolveWithObject: true });
      expect(out.info.channels).toBe(4);
      const d = out.data;

      // White cell: opaque, RGB preserved.
      expect(d[3]).toBeGreaterThan(250);
      expect(d[0]).toBe(255);
      expect(d[1]).toBe(255);
      expect(d[2]).toBe(255);

      // Black cell: transparent, RGB preserved.
      expect(d[7]).toBeLessThan(5);
      expect(d[4]).toBe(0);
      expect(d[5]).toBe(0);
      expect(d[6]).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
