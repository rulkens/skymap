/**
 * /api/process/alpha-only — re-runs the alpha pass against the cached
 * starless.png from a previous /api/process call.  Should be fast
 * (no StarNet spawn) and should NOT touch starless.png.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { handleProcessAlphaOnly } from '../../../../tools/famous-curator/plugin/routes/processAlphaOnly';

async function seedSessionWithStarless(): Promise<{ tmpId: string; dir: string; starlessMtimeMs: number }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-alpha-only-'));
  const tmpId = 'sess';
  const dir = join(root, tmpId);
  require('node:fs').mkdirSync(dir, { recursive: true });
  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } },
  }).png().toBuffer();
  writeFileSync(join(dir, 'starless.png'), png);
  return { tmpId, dir, starlessMtimeMs: statSync(join(dir, 'starless.png')).mtimeMs };
}

describe('handleProcessAlphaOnly', () => {
  it('overwrites alpha.webp without touching starless.png', async () => {
    const sess = await seedSessionWithStarless();
    const before = sess.starlessMtimeMs;
    // Sleep 5 ms so any accidental rewrite produces a different mtime.
    await new Promise((r) => setTimeout(r, 5));
    const result = await handleProcessAlphaOnly({
      body: {
        tmpId: sess.tmpId,
        alpha: { blackPoint: 0, whitePoint: 255, gamma: 1 },
      },
      sessionDirOverride: sess.dir,
    });
    // URL includes a ?v=<timestamp> cache-buster so each alpha re-render
    // bypasses the browser cache for the rewritten alpha.webp.
    expect(result.alphaPreviewUrl).toMatch(/^\/api\/preview\/sess\/alpha\.webp\?v=\d+$/);
    expect(existsSync(join(sess.dir, 'alpha.webp'))).toBe(true);
    expect(statSync(join(sess.dir, 'starless.png')).mtimeMs).toBe(before);
  });

  it('throws a clear error if starless.png is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'curator-alpha-only-missing-'));
    const dir = join(root, 'sess2');
    require('node:fs').mkdirSync(dir, { recursive: true });
    await expect(
      handleProcessAlphaOnly({
        body: { tmpId: 'sess2', alpha: { blackPoint: 0, whitePoint: 255, gamma: 1 } },
        sessionDirOverride: dir,
      }),
    ).rejects.toThrow(/starless\.png/);
  });
});
