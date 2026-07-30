/**
 * Contract tests for the planet-texture R2 inventory helper.
 *
 * The deploy sweep itself shells out to wrangler and the Cloudflare
 * purge API, so the pure inventory step (which local file maps to
 * which R2 key) is the testable seam — given a correct inventory the
 * `syncR2.ts` upload loop is mechanical.
 *
 * Two contracts pinned:
 *
 *   1. ALLOW shape: `.jpg` / `.webp` files are included; sidecar files
 *      (e.g. a manifest.json the build drops next to the textures) are
 *      not.
 *   2. R2 key shape: `data/images/textures/<file>`. The `data/` prefix
 *      is load-bearing — `dataUrl()` in
 *      `src/services/loading/fetchWithProgress.ts` requests
 *      `images/textures/<file>` against the same base URL it uses for
 *      `.bin` files.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectTextureImages } from '../../../../tools/deploy/r2/collectTextureImages';

/**
 * Build an isolated public/data/images/textures/-shaped tree under a
 * fresh tmpdir.  Includes a manifest.json sidecar to prove the filter
 * rejects non-image files.
 */
function fixtureDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'syncr2-textures-'));
  const dir = join(root, 'textures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mars-2048.jpg'), Buffer.from([1, 2, 3, 4]));
  writeFileSync(join(dir, 'saturn-ring-8192.webp'), Buffer.from([5, 6, 7, 8]));
  writeFileSync(join(dir, 'manifest.json'), '{}');
  return dir;
}

describe('collectTextureImages', () => {
  it('maps files to the textures r2 prefix and skips non-image sidecars', () => {
    const dir = fixtureDir();
    const inventory = collectTextureImages(dir);
    const mars = inventory.find((e) => e.localPath.endsWith('mars-2048.jpg'));
    expect(mars?.r2Key).toBe('data/images/textures/mars-2048.jpg');
    const saturn = inventory.find((e) => e.localPath.endsWith('saturn-ring-8192.webp'));
    expect(saturn?.r2Key).toBe('data/images/textures/saturn-ring-8192.webp');
    expect(inventory.map((e) => e.r2Key.split('/').pop())).not.toContain('manifest.json');
    expect(inventory).toHaveLength(2);
  });

  it('returns [] when the directory is absent (code-only deploy)', () => {
    // A deploy that hasn't run the texture build means the directory
    // simply does not exist; the sweep should silently produce zero
    // uploads rather than fail.
    const root = mkdtempSync(join(tmpdir(), 'syncr2-textures-absent-'));
    expect(collectTextureImages(join(root, 'nonexistent'))).toEqual([]);
  });
});
