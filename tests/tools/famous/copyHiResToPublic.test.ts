/**
 * copyHiResToPublic — the build step that flattens the curator's
 * per-galaxy directory tree (`public/images/famous-curated/<id>/full.webp`)
 * into a single sweep-friendly directory
 * (`public/data/images/famous-hires/<id>.webp`) for `syncR2` to upload.
 *
 * These tests pin three contracts:
 *
 *   1. The copy lands every full.webp at the expected flat path.
 *   2. Galaxies without a `full.webp` (curator hasn't finished them yet)
 *      do NOT throw — they show up in the `missing[]` return so the CLI
 *      caller can log graceful coverage.
 *   3. Re-running the copy after the source is unchanged is essentially
 *      free — no bytes re-written.  This is load-bearing because the
 *      step runs every `build-tiers` / `build-all`; an O(n) re-encode
 *      per dev iteration would be a tax for no signal change.
 */
import { describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyHiResToPublic } from '../../../tools/famous/copyHiResToPublic';

/**
 * Build an isolated curator-output tree under a fresh tmpdir.
 *
 *   <root>/source/m31/full.webp        (4 bytes)
 *   <root>/source/m31/recipe.json
 *   <root>/source/ngc1300/full.webp    (4 bytes)
 *   <root>/source/c21/recipe.json      (no full.webp — missing case)
 *   <root>/dest/                       (empty)
 */
function fixtureTree(): { sourceDir: string; destDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'famous-hires-copy-'));
  const sourceDir = join(root, 'source');
  const destDir = join(root, 'dest');
  mkdirSync(join(sourceDir, 'm31'), { recursive: true });
  mkdirSync(join(sourceDir, 'ngc1300'), { recursive: true });
  mkdirSync(join(sourceDir, 'c21'), { recursive: true });
  writeFileSync(join(sourceDir, 'm31', 'full.webp'), Buffer.from([1, 2, 3, 4]));
  writeFileSync(join(sourceDir, 'm31', 'recipe.json'), '{}');
  writeFileSync(join(sourceDir, 'ngc1300', 'full.webp'), Buffer.from([5, 6, 7, 8]));
  writeFileSync(join(sourceDir, 'c21', 'recipe.json'), '{}');
  return { sourceDir, destDir };
}

describe('copyHiResToPublic', () => {
  it('copies full.webp into a flat layout', async () => {
    const { sourceDir, destDir } = fixtureTree();
    const result = await copyHiResToPublic({ sourceDir, destDir });
    expect(result.copied).toBe(2);
    expect(Array.from(readFileSync(join(destDir, 'm31.webp')))).toEqual([1, 2, 3, 4]);
    expect(Array.from(readFileSync(join(destDir, 'ngc1300.webp')))).toEqual([5, 6, 7, 8]);
  });

  it('records IDs missing full.webp', async () => {
    const { sourceDir, destDir } = fixtureTree();
    const result = await copyHiResToPublic({ sourceDir, destDir });
    expect(result.missing).toEqual(['c21']);
  });

  it('is idempotent on re-run', async () => {
    const { sourceDir, destDir } = fixtureTree();
    const first = await copyHiResToPublic({ sourceDir, destDir });
    expect(first.copied).toBe(2);
    // Capture mtimes after the first copy so we can prove the second run
    // didn't rewrite the bytes (a re-copy would refresh mtime even with
    // identical content).
    const mtime1M31 = statSync(join(destDir, 'm31.webp')).mtimeMs;
    const mtime1Ngc = statSync(join(destDir, 'ngc1300.webp')).mtimeMs;
    const second = await copyHiResToPublic({ sourceDir, destDir });
    expect(second.copied).toBe(0);
    expect(second.skipped).toBe(2);
    expect(statSync(join(destDir, 'm31.webp')).mtimeMs).toBe(mtime1M31);
    expect(statSync(join(destDir, 'ngc1300.webp')).mtimeMs).toBe(mtime1Ngc);
  });
});
