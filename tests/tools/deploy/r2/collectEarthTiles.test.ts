/**
 * Contract tests for the Earth-tile R2 inventory helper.
 *
 * Two contracts pinned:
 *
 *   1. Absent-index behaviour: an interrupted bake (or a fresh checkout that
 *      hasn't baked tiles at all) leaves no `index.txt`, and the collector
 *      must produce zero uploads rather than fail or walk the tree.
 *   2. Path containment: every `localPath` stays inside `imagesDir`. The
 *      bulk transport runs `relative(localRoot, localPath)` and hands the
 *      result to rclone, which rejects a `../` escape — a malformed index
 *      line must not slip past this collector unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { collectEarthTiles } from '../../../../tools/deploy/r2/collectEarthTiles';

function fixtureDir(indexContents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'syncr2-earth-tiles-'));
  const tilesDir = join(root, 'earth-tiles');
  mkdirSync(tilesDir, { recursive: true });
  writeFileSync(join(tilesDir, 'index.txt'), indexContents);
  return root;
}

describe('collectEarthTiles', () => {
  it('returns [] when index.txt is absent (interrupted bake)', () => {
    const root = mkdtempSync(join(tmpdir(), 'syncr2-earth-tiles-absent-'));
    expect(collectEarthTiles(join(root, 'images'))).toEqual([]);
  });

  it('maps an index line to the matching localPath/r2Key pair', () => {
    const imagesDir = fixtureDir('earth-tiles/v1/surface/3/0/0.webp\n');
    const inventory = collectEarthTiles(imagesDir);
    expect(inventory).toEqual([
      {
        localPath: join(imagesDir, 'earth-tiles/v1/surface/3/0/0.webp'),
        r2Key: 'data/images/earth-tiles/v1/surface/3/0/0.webp',
      },
    ]);
  });

  it('ignores blank lines and a trailing newline', () => {
    const imagesDir = fixtureDir(
      'earth-tiles/v1/surface/3/0/0.webp\n\nearth-tiles/v1/surface/3/0/1.webp\n',
    );
    expect(collectEarthTiles(imagesDir)).toHaveLength(2);
  });

  it('keeps every localPath inside imagesDir', () => {
    const imagesDir = fixtureDir(
      'earth-tiles/v1/surface/3/0/0.webp\nearth-tiles/v1/surface/3/0/1.webp\n',
    );
    const inventory = collectEarthTiles(imagesDir);
    for (const { localPath } of inventory) {
      expect(relative(imagesDir, localPath).startsWith('..')).toBe(false);
    }
  });
});
