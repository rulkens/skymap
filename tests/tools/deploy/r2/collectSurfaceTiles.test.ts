/**
 * The surface-tile R2 inventory walks manifest -> band levels -> index -> parts.
 * Pinned: no manifest means nothing uploads (interrupted bake); levels without an
 * index are skipped; an index naming a missing part throws; loose tiles are never
 * listed; both products are walked.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { surfaceTileArchivePath } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileArchivePath';
import { collectSurfaceTiles } from '../../../../tools/deploy/r2/collectSurfaceTiles';
import { encodeSurfaceTileArchiveIndex } from '../../../../tools/textures/utils/encodeSurfaceTileArchiveIndex';

const KEY = 'earth-tiles';
const PREFIX = 'earth-tiles/v11';
const BOX = { west: 0, south: 0, east: 1, north: 1 };

function write(root: string, rel: string, bytes: string | Uint8Array): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), bytes);
}

/** Manifest with an albedo band z2..z4 and a height band z3..z3. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'syncr2-surface-tiles-'));
  const provenance = { sourceId: 's', attribution: 'a', vintage: 'v' };
  write(
    root,
    `${KEY}/manifest.json`,
    JSON.stringify({
      prefix: PREFIX,
      tilePx: 256,
      bands: [
        { bounds: BOX, min: 2, max: 4, builtFrom: { albedo: provenance } },
        { bounds: BOX, min: 3, max: 3, builtFrom: { height: provenance } },
      ],
    }),
  );
  return root;
}

const writeLevel = (root: string, product: 'albedo' | 'height', z: number, parts: number): void => {
  write(root, surfaceTileArchivePath(PREFIX, product, z), encodeSurfaceTileArchiveIndex([], parts));
  for (let k = 0; k < parts; k++) write(root, surfaceTileArchivePath(PREFIX, product, z, k), 'x');
};

describe('collectSurfaceTiles', () => {
  it('returns [] when the manifest is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'syncr2-surface-tiles-absent-'));
    expect(collectSurfaceTiles(root, KEY)).toEqual([]);
  });

  it('lists each level index and every part it names, across both products', () => {
    const root = fixture();
    writeLevel(root, 'albedo', 3, 2);
    writeLevel(root, 'height', 3, 1);
    const keys = collectSurfaceTiles(root, KEY).map((u) => u.r2Key);
    expect(keys.sort()).toEqual(
      [
        `data/images/${PREFIX}/albedo/z3.idx`,
        `data/images/${PREFIX}/albedo/z3.p0.pack`,
        `data/images/${PREFIX}/albedo/z3.p1.pack`,
        `data/images/${PREFIX}/height/z3.idx`,
        `data/images/${PREFIX}/height/z3.p0.pack`,
      ].sort(),
    );
    expect(collectSurfaceTiles(root, KEY)[0]!.localPath).toBe(
      join(root, `${PREFIX}/albedo/z3.idx`),
    );
  });

  it('skips levels inside the band range that have no index', () => {
    const root = fixture();
    writeLevel(root, 'albedo', 4, 1);
    expect(collectSurfaceTiles(root, KEY).map((u) => u.r2Key)).toEqual([
      `data/images/${PREFIX}/albedo/z4.idx`,
      `data/images/${PREFIX}/albedo/z4.p0.pack`,
    ]);
  });

  it('throws when an index names a part that is not on disk', () => {
    const root = fixture();
    write(root, surfaceTileArchivePath(PREFIX, 'albedo', 2), encodeSurfaceTileArchiveIndex([], 1));
    expect(() => collectSurfaceTiles(root, KEY)).toThrow(/part 0/);
  });

  it('never lists loose tiles', () => {
    const root = fixture();
    writeLevel(root, 'albedo', 3, 1);
    write(root, `${PREFIX}/albedo/3/0/0.webp`, 'tile');
    expect(collectSurfaceTiles(root, KEY).some((u) => u.r2Key.endsWith('.webp'))).toBe(false);
  });
});
