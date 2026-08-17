/**
 * Contract tests for the hi-res famous-galaxy R2 inventory helper.
 *
 * The deploy sweep itself shells out to wrangler and the Cloudflare
 * purge API, so the pure inventory step (which local file maps to
 * which R2 key) is the testable seam — given a correct inventory the
 * `syncR2.ts` upload loop is mechanical.
 *
 * Two contracts pinned:
 *
 *   1. ALLOW shape: `.webp` files are included; sidecar files
 *      (e.g. recipe.json the curator drops next to images) are not.
 *   2. R2 key shape: `data/images/famous-hires/<id>.webp`. The
 *      `data/` prefix is load-bearing — `dataUrl()` in
 *      `src/services/loading/fetchWithProgress.ts` requests
 *      `images/famous-hires/<id>.webp` against the same base URL it
 *      uses for `.bin` files.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHiResImages } from '../../../../tools/deploy/r2/collectHiResImages';

/**
 * Build an isolated public/data/images/famous-hires/-shaped tree under
 * a fresh tmpdir.  Includes a recipe.json sidecar to prove the filter
 * rejects non-webp files.
 */
function fixtureDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'syncr2-hires-'));
  const dir = join(root, 'famous-hires');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'c101.webp'), Buffer.from([1, 2, 3, 4]));
  writeFileSync(join(dir, 'm31.webp'), Buffer.from([5, 6, 7, 8]));
  writeFileSync(join(dir, 'recipe.json'), '{}');
  return dir;
}

describe('collectHiResImages', () => {
  it('accepts famous-hires .webp files and skips sidecars', () => {
    const dir = fixtureDir();
    const inventory = collectHiResImages(dir);
    const names = inventory.map((e) => e.r2Key.split('/').pop());
    expect(names).toContain('c101.webp');
    expect(names).toContain('m31.webp');
    expect(names).not.toContain('recipe.json');
    expect(inventory).toHaveLength(2);
  });

  it('computes R2 keys with the data/images/famous-hires/ prefix', () => {
    const dir = fixtureDir();
    const inventory = collectHiResImages(dir);
    const c101 = inventory.find((e) => e.localPath.endsWith('c101.webp'));
    expect(c101?.r2Key).toBe('data/images/famous-hires/c101.webp');
    const m31 = inventory.find((e) => e.localPath.endsWith('m31.webp'));
    expect(m31?.r2Key).toBe('data/images/famous-hires/m31.webp');
  });

  it('returns [] when the directory is absent (fresh checkout)', () => {
    // No `npm run build-famous-hires` yet means the directory simply does
    // not exist; the sweep should silently produce zero uploads rather
    // than fail.
    const root = mkdtempSync(join(tmpdir(), 'syncr2-hires-absent-'));
    expect(collectHiResImages(join(root, 'nonexistent'))).toEqual([]);
  });
});
