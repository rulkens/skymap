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
  cropFrame?: { width: number; height: number },
): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-export-sess-'));
  const tmpId = 'sx';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  // `size` is the ORIGINAL source frame, recorded in recipe.source.
  writeFileSync(join(dir, 'source.png'), await makePng(size, size));
  // cropped.png (with stars) + starless.png (stars removed) are what
  // handleProcess caches — both ALREADY in the committed frame, i.e. the
  // square the deproject stretch landed on.  Export only downsizes them, so
  // the fixture seeds that final frame directly (defaulting to a square match
  // of the source for the happy-path tests).
  const cf = cropFrame ?? { width: size, height: size };
  const crop = await makePng(cf.width, cf.height);
  writeFileSync(join(dir, 'cropped.png'), crop);
  writeFileSync(join(dir, 'starless.png'), crop);
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

  it('publishes BOTH runtime tiers (low-res atlas + hi-res full)', async () => {
    // Regression: Commit used to publish only the low-res atlas tile; the
    // gitignored hi-res slot was left stale until a manual build-famous-hires.
    // handleExport now publishes both via publishFamousRuntimeImages.
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
    expect(existsSync(resolve(repo, 'public/images/famous/m31.webp'))).toBe(true);
    expect(existsSync(resolve(repo, 'public/data/images/famous-hires/m31.webp'))).toBe(true);
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
    // handleProcess already deprojected the crop to a square before StarNet, so
    // cropped.png + starless.png arrive at the committed 400×400 frame.  Export
    // only downsizes them (no second stretch), so every shipped raster is square
    // and the baked calibration is face-on.
    const sess = await seedSession(600, { width: 400, height: 400 });
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
    // ...and the baked calibration is flagged deprojected, so the runtime
    // places the face-on texture on the catalog's real 3D plane.  Orientation
    // is no longer carried on the calibration (no PA / axisRatio fields).
    expect(res.calibration?.deprojected).toBe(true);
  });

  it('leaves as-shot (deproject off) output unchanged — square crop ⇒ square out', async () => {
    const sess = await seedSession(600, { width: 400, height: 400 });
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
