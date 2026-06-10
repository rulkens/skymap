/**
 * handleExport — hi-res / low-res registration (no double-deproject).
 *
 * Regression: export must not re-run deprojectDisk.  `process.ts` deprojects
 * the crop BEFORE StarNet, so the cached `cropped.png` (with stars) and
 * `starless.png` are ALREADY in the face-on frame — a second stretch would
 * doubly foreshorten `full.webp`/`atlas.webp` relative to the preview.
 *
 * The contract this pins: export is a faithful DOWNSCALE of the full-res
 * buffers process already produced.  It applies no geometry of its own, so
 * source / starless / full stay pixel-registered (same dimensions) and a
 * square input ships a square output.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../tools/famous-curator/plugin/routes/export';

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 100, g: 120, b: 80, alpha: 255 } },
  })
    .png()
    .toBuffer();
}

/**
 * Seed a session the way `handleProcess` leaves it for a deprojected disk:
 *   source.png   — the original fetched frame (used only for recipe.source dims)
 *   cropped.png  — the with-stars crop, ALREADY deprojected to a square
 *   starless.png — the StarNet output, ALREADY deprojected to the same square
 */
async function seedDeprojectedSession(): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-registration-sess-'));
  const tmpId = 'rg';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'source.png'), await makePng(600, 600));
  writeFileSync(join(dir, 'cropped.png'), await makePng(400, 400));
  writeFileSync(join(dir, 'starless.png'), await makePng(400, 400));
  return { tmpId, sessionDir: dir };
}

function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-registration-repo-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

describe('handleExport — hi-res / low-res registration', () => {
  it('does not re-deproject the already-deprojected starless layer', async () => {
    const sess = await seedDeprojectedSession();
    const repo = fakeRepoRoot();

    const res = await handleExport({
      body: {
        id: 'tilt',
        tmpId: sess.tmpId,
        crop: { x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 },
        starnet: { stride: 16, upsample: false },
        alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
        metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
        disk: { centerPx: [300, 300], radiusPx: 80, paDeg: 30, axisRatio: 0.5, deproject: true },
        catalogAxisRatio: 0.5,
      },
      repoRoot: repo,
      starnetConfig: { mock: true },
      sessionDirOverride: sess.sessionDir,
    });

    const src = await sharp(res.paths.source).metadata();
    const starless = await sharp(res.paths.starless).metadata();
    const full = await sharp(res.paths.full).metadata();

    // Square cropped/starless in ⇒ square out: a second deproject would
    // Y-stretch starless/full into a tall rectangle.
    expect(starless.width).toBe(starless.height);
    expect(full.width).toBe(full.height);

    // All three full-res rasters share one frame — source (with stars) and
    // starless (stars removed) must overlay exactly, as must full.
    expect(src.width).toBe(starless.width);
    expect(src.height).toBe(starless.height);
    expect(full.width).toBe(starless.width);
  });
});
