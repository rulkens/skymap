import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { checkCloudTier } from '../../../tools/clouds/checkCloudTier';
import { writeCloudTier } from '../../../tools/textures/writeCloudTier';

const TIER_PX = 64;

/** A noisy RGB image, grey or tinted, as PNG: the source writeCloudTier would get. */
async function source(width: number, height: number, tint: number): Promise<string> {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const v = (i * 2654435761) % 251;
    rgb.set([v, Math.min(255, v + tint), v], i * 3);
  }
  const path = join(mkdtempSync(join(tmpdir(), 'checkCloudTier-')), 'src.png');
  await sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(path);
  return path;
}

describe('checkCloudTier', () => {
  it('accepts a lossy grey tier', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'checkCloudTier-')), 'tier.webp');
    await writeCloudTier(await source(128, 64, 0), TIER_PX, out);
    await expect(checkCloudTier(out, TIER_PX)).resolves.toBeUndefined();
  });

  it('rejects a tier with the wrong dimensions', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'checkCloudTier-')), 'tier.webp');
    await writeCloudTier(await source(128, 64, 0), TIER_PX / 2, out);
    await expect(checkCloudTier(out, TIER_PX)).rejects.toThrow(/32×16, want 64×32/);
  });

  it('rejects a colour image', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'checkCloudTier-')), 'tier.webp');
    await sharp(await source(TIER_PX, TIER_PX / 2, 60))
      .webp({ quality: 80 })
      .toFile(out);
    await expect(checkCloudTier(out, TIER_PX)).rejects.toThrow(/not grey/);
  });
});
