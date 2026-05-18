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

async function seedSession(): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-export-sess-'));
  const tmpId = 'sx';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  const png = await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 100, g: 110, b: 120, alpha: 1 } },
  }).png().toBuffer();
  writeFileSync(join(dir, 'source.png'), png);
  writeFileSync(join(dir, 'starless.png'), png);
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
        crop: { x: 0, y: 0, width: 256, height: 256 },
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

  it('records the entry in the override index', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    await handleExport({
      body: {
        id: 'm31', tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://example.com', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const idx = JSON.parse(readFileSync(resolve(repo, 'data/famous_curated_overrides.json'), 'utf8'));
    expect(idx.entries.m31.author).toBe('Alice');
    expect(idx.entries.m31.dir).toBe('famous-curated/m31');
  });

  it('replaces previous contents when re-exporting the same id', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    // First export.
    await handleExport({
      body: {
        id: 'm31', tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
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
        id: 'm31', tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
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
