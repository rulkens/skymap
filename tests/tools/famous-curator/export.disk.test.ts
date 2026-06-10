/**
 * handleExport — disk-geometry persistence tests.
 *
 * Covers the two contract additions from the famous-thumbnail-placement
 * build-pipeline plan:
 *   1. When the export body carries a `disk`, the written recipe.json
 *      must reflect it exactly (deep-equal after parseRecipe round-trip).
 *   2. When `disk` is absent the written recipe.json must not contain
 *      a disk key at all (no null, no empty object — just absent).
 *
 * Both tests use `sessionDirOverride` and a tmp `repoRoot` to avoid
 * touching the real public/ tree.  `repoRoot` isolates output fully:
 * `curatedGalaxyDir(repoRoot, id)`, the atlas copy, and the override
 * index all derive from it, so no real-repo paths are ever written.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../tools/famous-curator/plugin/routes/export';
import { parseRecipe, type RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';
import { curatedGalaxyDir } from '../../../tools/famous-curator/plugin/paths';

/**
 * Create a tiny 64×64 RGBA PNG and write the three buffers handleProcess
 * leaves behind: source.png (original), cropped.png (with stars) and
 * starless.png (stars removed).  Export reads cropped.png + starless.png for
 * its rasters and source.png only for the recorded dimensions.
 */
async function seedSession(): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-disk-sess-'));
  const tmpId = 'dx';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 80, g: 90, b: 100, alpha: 1 } },
  })
    .png()
    .toBuffer();
  writeFileSync(join(dir, 'source.png'), png);
  writeFileSync(join(dir, 'cropped.png'), png);
  writeFileSync(join(dir, 'starless.png'), png);
  return { tmpId, sessionDir: dir };
}

/** Minimal fake repoRoot with the override-index parent dir present. */
function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-disk-repo-'));
  mkdirSync(resolve(root, 'data/seeds'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

/** A centred 32×32 crop that stays well within the 64×64 source image. */
const CROP = { x: 16, y: 16, width: 32, height: 32, rotationDeg: 0 };

/** Minimal but complete export body fields (disk is added per-test). */
function baseBody(tmpId: string) {
  return {
    id: 'ngc1234',
    tmpId,
    crop: CROP,
    starnet: { stride: 64, upsample: false },
    alpha: { blackPoint: 5, whitePoint: 220, gamma: 0.8 },
    metadata: { sourceUrl: 'https://example.com/ngc1234', license: 'CC-BY-4.0', author: 'Tester' },
  } as const;
}

describe('handleExport — disk field', () => {
  it('persists disk onto the recipe', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();

    const disk: RecipeDisk = {
      centerPx: [32, 32],
      radiusPx: 12,
      paDeg: 45,
      axisRatio: 0.7,
      deproject: true,
    };

    await handleExport({
      body: { ...baseBody(sess.tmpId), disk },
      repoRoot: repo,
      starnetConfig: { mock: true },
      sessionDirOverride: sess.sessionDir,
    });

    const json = readFileSync(resolve(curatedGalaxyDir(repo, 'ngc1234'), 'recipe.json'), 'utf8');
    const parsed = parseRecipe(json);

    expect(parsed.disk).toBeDefined();
    expect(parsed.disk!.centerPx).toEqual([32, 32]);
    expect(parsed.disk!.radiusPx).toBe(12);
    expect(parsed.disk!.paDeg).toBe(45);
    expect(parsed.disk!.axisRatio).toBe(0.7);
    expect(parsed.disk!.deproject).toBe(true);
  });

  it('omits disk from the recipe when absent', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();

    await handleExport({
      body: baseBody(sess.tmpId),
      repoRoot: repo,
      starnetConfig: { mock: true },
      sessionDirOverride: sess.sessionDir,
    });

    const json = readFileSync(resolve(curatedGalaxyDir(repo, 'ngc1234'), 'recipe.json'), 'utf8');
    const parsed = parseRecipe(json);

    expect(parsed.disk).toBeUndefined();
  });
});
