/**
 * publishFamousRuntimeImages — publish one curated galaxy's two runtime tiers.
 *
 * Single source of truth for where the runtime reads each famous-galaxy image:
 *   atlas.webp -> public/images/famous/<id>.webp            (low-res, committed)
 *   full.webp  -> public/data/images/famous-hires/<id>.webp (hi-res, gitignored)
 *   thumb.webp -> public/images/famous-thumb/<id>.webp      (InfoCard, committed)
 *
 * Verifies all three copies land, the idempotent skip fires on an unchanged
 * re-run, and a missing master tier is reported (not thrown).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  publishFamousRuntimeImages,
  HIRES_RUNTIME_DIR,
  LOWRES_RUNTIME_DIR,
  THUMB_RUNTIME_DIR,
  CURATED_DIR,
} from '../../../tools/famous/publishFamousRuntimeImages';

async function makeWebp(side: number): Promise<Buffer> {
  return sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();
}

/** Fake repoRoot with a curated galaxy dir holding atlas.webp + full.webp. */
async function seedRepo(id: string, opts: { full?: boolean } = {}): Promise<string> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'publish-runtime-'));
  const curated = resolve(repoRoot, CURATED_DIR, id);
  mkdirSync(curated, { recursive: true });
  writeFileSync(join(curated, 'atlas.webp'), await makeWebp(256));
  writeFileSync(join(curated, 'thumb.webp'), await makeWebp(256));
  if (opts.full !== false) writeFileSync(join(curated, 'full.webp'), await makeWebp(1024));
  return repoRoot;
}

describe('publishFamousRuntimeImages', () => {
  it('copies the atlas to the low-res slot and full to the hi-res slot', async () => {
    const repoRoot = await seedRepo('m101');
    const result = publishFamousRuntimeImages({ repoRoot, id: 'm101' });

    expect(result).toEqual({ lowRes: 'copied', hiRes: 'copied', thumb: 'copied' });
    expect(existsSync(resolve(repoRoot, LOWRES_RUNTIME_DIR, 'm101.webp'))).toBe(true);
    expect(existsSync(resolve(repoRoot, HIRES_RUNTIME_DIR, 'm101.webp'))).toBe(true);
    expect(existsSync(resolve(repoRoot, THUMB_RUNTIME_DIR, 'm101.webp'))).toBe(true);
  });

  it('skips an unchanged re-run (idempotent)', async () => {
    const repoRoot = await seedRepo('m101');
    publishFamousRuntimeImages({ repoRoot, id: 'm101' });
    // Second run with no source change must skip both tiers.
    const again = publishFamousRuntimeImages({ repoRoot, id: 'm101' });
    expect(again).toEqual({ lowRes: 'skipped', hiRes: 'skipped', thumb: 'skipped' });
  });

  it('re-copies after the master changes', async () => {
    const repoRoot = await seedRepo('m101');
    publishFamousRuntimeImages({ repoRoot, id: 'm101' });
    // Rewrite full.webp with a newer mtime + different size → hi-res re-copies.
    const fullPath = resolve(repoRoot, CURATED_DIR, 'm101', 'full.webp');
    writeFileSync(fullPath, await makeWebp(512));
    const future = new Date(Date.now() + 5000);
    utimesSync(fullPath, future, future);
    const again = publishFamousRuntimeImages({ repoRoot, id: 'm101' });
    expect(again.hiRes).toBe('copied');
  });

  it('reports a missing tier instead of throwing', async () => {
    const repoRoot = await seedRepo('m101', { full: false });
    const result = publishFamousRuntimeImages({ repoRoot, id: 'm101' });
    expect(result.lowRes).toBe('copied');
    expect(result.hiRes).toBe('missing');
    expect(existsSync(resolve(repoRoot, HIRES_RUNTIME_DIR, 'm101.webp'))).toBe(false);
  });
});
