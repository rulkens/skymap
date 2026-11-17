import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { KeyedTilePath } from '../../@types/textures/KeyedTilePath';
import { writeFileAtomic } from '../io/writeFileAtomic';
import type { SurfaceTileProduct } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileProduct';
import { SURFACE_TILE_ARCHIVE_MAX_PART_BYTES } from '../../../src/layers/body/surfaceTiles/archive/data/surfaceTileArchiveFormat';
import { surfaceTileArchivePath } from '../../../src/layers/body/surfaceTiles/archive/utils/surfaceTileArchivePath';
import { surfaceTileMortonKey } from '../../../src/layers/body/surfaceTiles/archive/utils/surfaceTileMortonKey';
import { encodeSurfaceTileArchiveIndex } from './encodeSurfaceTileArchiveIndex';
import { planSurfaceTileParts } from './planSurfaceTileParts';

/**
 * packSurfaceTileLevels — writes every (product, z) level's `.p<k>.pack` parts
 * and `.idx` for `sortedPaths` (`index.txt` lines, `<prefix>/<product>/<z>/<x>/<y>.webp`).
 * Tiles sit in Morton order and parts are filled in that order, so the output
 * is byte-identical across runs. Returns the number of files written.
 */
export function packSurfaceTileLevels(
  outDir: string,
  tilePrefix: string,
  sortedPaths: readonly string[],
): number {
  const levels = new Map<
    string,
    { product: SurfaceTileProduct; z: number; tiles: KeyedTilePath[] }
  >();
  for (const path of sortedPaths) {
    if (!path.startsWith(`${tilePrefix}/`)) {
      throw new Error(
        `packSurfaceTileLevels: ${path} is not under ${tilePrefix}/ (stale index.txt?)`,
      );
    }
    const [product, z, x, yFile] = path.slice(tilePrefix.length + 1).split('/');
    const y = Number.parseInt(yFile!, 10);
    const id = `${product}/${z}`;
    let level = levels.get(id);
    if (!level) {
      level = { product: product as SurfaceTileProduct, z: Number(z), tiles: [] };
      levels.set(id, level);
    }
    level.tiles.push({ key: surfaceTileMortonKey(Number(x), y), path });
  }

  let files = 0;
  for (const { product, z, tiles } of levels.values()) {
    tiles.sort((a, b) => a.key - b.key);
    const { entries, partCount } = planSurfaceTileParts(
      tiles.map((t) => ({ key: t.key, length: statSync(join(outDir, t.path)).size })),
      SURFACE_TILE_ARCHIVE_MAX_PART_BYTES,
    );
    for (let part = 0; part < partCount; part++) {
      const members = tiles
        .filter((_, i) => entries[i]!.part === part)
        .map((t) => readFileSync(join(outDir, t.path)));
      const partPath = join(outDir, surfaceTileArchivePath(tilePrefix, product, z, part));
      writeFileAtomic(partPath, Buffer.concat(members));
      files++;
    }
    writeFileAtomic(
      join(outDir, surfaceTileArchivePath(tilePrefix, product, z)),
      encodeSurfaceTileArchiveIndex(entries, partCount),
    );
    files++;
    // A smaller re-pack must not leave an older, larger run's tail parts behind.
    for (let part = partCount; ; part++) {
      const stale = join(outDir, surfaceTileArchivePath(tilePrefix, product, z, part));
      if (!existsSync(stale)) break;
      rmSync(stale);
    }
  }
  return files;
}
