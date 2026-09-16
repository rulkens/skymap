/**
 * Contract tests for the surface-tile R2 inventory helper.
 *
 * Three contracts pinned:
 *
 *   1. Absent-index behaviour: an interrupted bake (or a fresh checkout that
 *      hasn't baked tiles at all) leaves no `index.txt`, and the collector
 *      must produce zero uploads rather than fail or walk the tree.
 *   2. Path containment: every `localPath` stays inside `imagesDir`. The
 *      bulk transport runs `relative(localRoot, localPath)` and hands the
 *      result to rclone, which rejects a `../` escape — a malformed index
 *      line must not slip past this collector unnoticed.
 *   3. `manifestKey` selects the folder read: a `mars-tiles` index must not
 *      be read off `earth-tiles/index.txt`, or vice versa.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { collectSurfaceTiles } from '../../../../tools/deploy/r2/collectSurfaceTiles';

function fixtureDir(manifestKey: string, indexContents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'syncr2-surface-tiles-'));
  const tilesDir = join(root, manifestKey);
  mkdirSync(tilesDir, { recursive: true });
  writeFileSync(join(tilesDir, 'index.txt'), indexContents);
  return root;
}

describe('collectSurfaceTiles', () => {
  it('returns [] when index.txt is absent (interrupted bake)', () => {
    const root = mkdtempSync(join(tmpdir(), 'syncr2-surface-tiles-absent-'));
    expect(collectSurfaceTiles(join(root, 'images'), 'earth-tiles')).toEqual([]);
  });

  it('maps an index line to the matching localPath/r2Key pair', () => {
    const imagesDir = fixtureDir('earth-tiles', 'earth-tiles/v1/surface/3/0/0.webp\n');
    const inventory = collectSurfaceTiles(imagesDir, 'earth-tiles');
    expect(inventory).toEqual([
      {
        localPath: join(imagesDir, 'earth-tiles/v1/surface/3/0/0.webp'),
        r2Key: 'data/images/earth-tiles/v1/surface/3/0/0.webp',
      },
    ]);
  });

  it('ignores blank lines and a trailing newline', () => {
    const imagesDir = fixtureDir(
      'earth-tiles',
      'earth-tiles/v1/surface/3/0/0.webp\n\nearth-tiles/v1/surface/3/0/1.webp\n',
    );
    expect(collectSurfaceTiles(imagesDir, 'earth-tiles')).toHaveLength(2);
  });

  it('keeps every localPath inside imagesDir', () => {
    const imagesDir = fixtureDir(
      'earth-tiles',
      'earth-tiles/v1/surface/3/0/0.webp\nearth-tiles/v1/surface/3/0/1.webp\n',
    );
    const inventory = collectSurfaceTiles(imagesDir, 'earth-tiles');
    for (const { localPath } of inventory) {
      expect(relative(imagesDir, localPath).startsWith('..')).toBe(false);
    }
  });

  it('reads <manifestKey>/index.txt, not a hardcoded earth-tiles folder', () => {
    const imagesDir = fixtureDir('mars-tiles', 'mars-tiles/v1/albedo/3/0/0.webp\n');
    expect(collectSurfaceTiles(imagesDir, 'mars-tiles')).toEqual([
      {
        localPath: join(imagesDir, 'mars-tiles/v1/albedo/3/0/0.webp'),
        r2Key: 'data/images/mars-tiles/v1/albedo/3/0/0.webp',
      },
    ]);
    // A different manifestKey over the same imagesDir sees nothing: the
    // fixture never wrote an earth-tiles/index.txt.
    expect(collectSurfaceTiles(imagesDir, 'earth-tiles')).toEqual([]);
  });
});
