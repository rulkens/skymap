/**
 * /api/export — atomic write of the four-WebP trio + recipe.json.
 *
 * Verifies:
 *   - source.webp, starless.webp, full.webp, atlas.webp, recipe.json
 *     all land in <repoRoot>/public/images/famous-curated/<id>/
 *   - .tmp/ staging dir is gone after success (renamed into place)
 *   - override index file gains the new entry
 *   - re-export of the same id replaces previous contents
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../../tools/famous-curator/plugin/routes/export';

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 100, g: 110, b: 120, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

async function seedSession(
  size = 256,
  starless?: { width: number; height: number },
): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-export-sess-'));
  const tmpId = 'sx';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  // `size` lets the deproject tests below seed a source large enough that a
  // tilted 400-px crop centred at [300,300] fits inside it; the default 256
  // keeps the original happy-path fixtures unchanged.
  writeFileSync(join(dir, 'source.png'), await makePng(size, size));
  // starless.png is produced by handleProcess (rotatedExtract → StarNet), so in
  // the real pipeline it already lives in the EXTRACTED crop frame — for a
  // deproject export that means the normalised b/a rect (e.g. 400×200), which
  // export then Y-stretches back to a square.  The fixture mirrors that frame
  // when `starless` is given; otherwise it matches the source.
  const sl = starless ?? { width: size, height: size };
  writeFileSync(join(dir, 'starless.png'), await makePng(sl.width, sl.height));
  return { tmpId, sessionDir: dir };
}

function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-export-repo-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

describe('handleExport', () => {
  it('writes all four WebPs + recipe.json and clears .tmp/', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    const result = await handleExport({
      body: {
        id: 'm31',
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://example.com', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const outDir = resolve(repo, 'public/images/famous-curated/m31');
    for (const name of ['source.webp', 'starless.webp', 'full.webp', 'atlas.webp', 'recipe.json']) {
      expect(existsSync(resolve(outDir, name))).toBe(true);
    }
    expect(existsSync(resolve(outDir, '.tmp'))).toBe(false);
    expect(result.paths.recipe.endsWith('recipe.json')).toBe(true);
  });

  it('records the source.png dimensions in recipe.source', async () => {
    // The crop is authored against source.png, so the recipe must capture that
    // image's true dimensions (read from the bytes, not the client) to let the
    // resume flow rescale exactly when a re-fetch returns a different size.
    const sess = await seedSession(300);
    const repo = fakeRepoRoot();
    await handleExport({
      body: {
        id: 'm31',
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 300, height: 300, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://example.com', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const outDir = resolve(repo, 'public/images/famous-curated/m31');
    const recipe = JSON.parse(readFileSync(resolve(outDir, 'recipe.json'), 'utf8'));
    expect(recipe.source).toEqual({ width: 300, height: 300 });
  });

  it('records the entry in the override index', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    await handleExport({
      body: {
        id: 'm31',
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://example.com', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const idx = JSON.parse(
      readFileSync(resolve(repo, 'data/famous_curated_overrides.json'), 'utf8'),
    );
    expect(idx.entries.m31.author).toBe('Alice');
    expect(idx.entries.m31.dir).toBe('famous-curated/m31');
  });

  it('replaces previous contents when re-exporting the same id', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    // First export.
    await handleExport({
      body: {
        id: 'm31',
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    // Drop a stale file inside the output dir that should NOT survive.
    const outDir = resolve(repo, 'public/images/famous-curated/m31');
    writeFileSync(resolve(outDir, 'stale.txt'), 'stale');
    // Re-export.
    await handleExport({
      body: {
        id: 'm31',
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256, rotationDeg: 0 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://b', license: 'CC-BY', author: 'Bob' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    expect(existsSync(resolve(outDir, 'stale.txt'))).toBe(false);
    const recipe = JSON.parse(readFileSync(resolve(outDir, 'recipe.json'), 'utf8'));
    expect(recipe.metadata.author).toBe('Bob');
  });
});

describe('deproject square output', () => {
  it('ships a square source.webp AND full.webp for a tilted disk', async () => {
    // Arrange a session with a non-square source and a tilted disk
    // (axisRatio 0.5, paDeg 30, deproject true).  The crop the UI sends is an
    // arbitrary square; squareDeprojectCrop snaps it (rotationDeg = paDeg,
    // height = width·b/a) so the deproject stretch resolves to width × width.
    // 600² source leaves room for the rotated 400×200 extract centred at
    // [300,300]; starless is seeded at that post-process 400×200 frame so the
    // export Y-stretch (×1/0.5 = 2) lands it on a 400×400 square like source.
    const sess = await seedSession(600, { width: 400, height: 200 });
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
      sessionDirOverride: sess.sessionDir,
    });
    // Every shipped raster is square...
    const src = await sharp(res.paths.source).metadata();
    const full = await sharp(res.paths.full).metadata();
    const atlas = await sharp(res.paths.atlas).metadata();
    expect(src.width).toBe(src.height);
    expect(full.width).toBe(full.height);
    expect(atlas.width).toBe(atlas.height);
    // ...and the baked calibration describes a face-on texture: PA collapsed to
    // 0 and axisRatio 1, so the runtime neither rotates nor re-tilts the quad.
    expect(res.calibration?.paDeg).toBe(0);
    expect(res.calibration?.axisRatio).toBe(1);
  });

  it('leaves as-shot (deproject off) output unchanged — square crop ⇒ square out', async () => {
    const sess = await seedSession(600);
    const repo = fakeRepoRoot();
    const res = await handleExport({
      body: {
        id: 'asshot',
        tmpId: sess.tmpId,
        crop: { x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 },
        starnet: { stride: 16, upsample: false },
        alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
        metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
        disk: { centerPx: [300, 300], radiusPx: 80, paDeg: 30, axisRatio: 0.5, deproject: false },
        catalogAxisRatio: 0.5,
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const src = await sharp(res.paths.source).metadata();
    expect(src.width).toBe(src.height);
  });
});
