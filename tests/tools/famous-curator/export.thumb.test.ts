/**
 * handleExport — non-deprojected thumb.webp.
 *
 * The atlas / full tiers are deprojected (Y-stretched to face-on) so they
 * re-project correctly onto the oriented billboard quad.  Shown FLAT in an
 * InfoCard that face-on stretch looks wrong, so export also writes a
 * thumb.webp built from the PRE-deproject crop: the galaxy at its true
 * on-sky inclination.
 *
 * Contract pinned here: for a tilted disk (b/a < 1) the thumb keeps the
 * natural foreshortening — it is WIDER than it is tall (major axis
 * horizontal in the extraction frame) — while atlas.webp stays square.
 * That asymmetry is the whole point: a square thumb would mean we shipped
 * the deprojected pixels by mistake.
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

async function seedSession(): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-thumb-sess-'));
  const tmpId = 'th';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  // source.png is the original fetched frame the thumb re-extracts from.
  writeFileSync(join(dir, 'source.png'), await makePng(600, 600));
  // cropped.png / starless.png are ALREADY deprojected (squares), as
  // handleProcess leaves them — they feed source/starless/full/atlas.
  writeFileSync(join(dir, 'cropped.png'), await makePng(400, 400));
  writeFileSync(join(dir, 'starless.png'), await makePng(400, 400));
  return { tmpId, sessionDir: dir };
}

function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-thumb-repo-'));
  mkdirSync(resolve(root, 'data/seeds'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

describe('handleExport — non-deprojected thumb.webp', () => {
  it('writes a thumb that keeps natural foreshortening while atlas stays square', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();

    const res = await handleExport({
      body: {
        id: 'tilt',
        tmpId: sess.tmpId,
        crop: { x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 },
        starnet: { stride: 16, upsample: false },
        alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
        metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
        disk: { centerPx: [300, 300], radiusPx: 80, paDeg: 0, axisRatio: 0.5, deproject: true },
        catalogAxisRatio: 0.5,
      },
      repoRoot: repo,
      starnetConfig: { mock: true },
      sessionDirOverride: sess.sessionDir,
    });

    const thumb = await sharp(res.paths.thumb).metadata();
    const atlas = await sharp(res.paths.atlas).metadata();

    // atlas is the deprojected square tile.
    expect(atlas.width).toBe(atlas.height);

    // thumb keeps the b/a=0.5 foreshortening: wider than tall, not square.
    expect(thumb.width!).toBeGreaterThan(thumb.height!);
  });
});
