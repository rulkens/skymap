import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceTileManifest } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import type { SurfaceTileProduct } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileProduct';
import { decodeSurfaceTileArchiveIndex } from '../../../src/layers/body/surfaceTiles/format/utils/decodeSurfaceTileArchiveIndex';
import { surfaceTileArchivePath } from '../../../src/layers/body/surfaceTiles/format/utils/surfaceTileArchivePath';
import type { R2Upload } from '../@types/R2Upload';

const PRODUCTS: readonly SurfaceTileProduct[] = ['albedo', 'height'];

/**
 * One `SURFACE_TILE_REGISTRY` row's packed tile archives (`z<z>.idx` plus the
 * `.p<k>.pack` parts each index names), found by walking the manifest's band
 * levels rather than the filesystem: the loose tiles stay local, and the
 * manifest is written last by the bake, so an interrupted bake uploads nothing.
 * An index naming a part that is not on disk throws: uploading it would
 * publish a level whose tiles 404 mid-pyramid.
 */
export function collectSurfaceTiles(imagesDir: string, manifestKey: string): R2Upload[] {
  const manifestPath = join(imagesDir, manifestKey, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const { prefix, bands } = JSON.parse(readFileSync(manifestPath, 'utf8')) as SurfaceTileManifest;

  const uploads: R2Upload[] = [];
  const add = (relPath: string): void => {
    uploads.push({ localPath: join(imagesDir, relPath), r2Key: `data/images/${relPath}` });
  };
  for (const product of PRODUCTS) {
    const ranged = bands.filter((band) => band.builtFrom[product] !== undefined);
    if (ranged.length === 0) continue;
    const lo = Math.min(...ranged.map((band) => band.min));
    const hi = Math.max(...ranged.map((band) => band.max));
    for (let z = lo; z <= hi; z++) {
      const idxPath = surfaceTileArchivePath(prefix, product, z);
      if (!existsSync(join(imagesDir, idxPath))) continue;
      add(idxPath);
      const { partCount } = decodeSurfaceTileArchiveIndex(readFileSync(join(imagesDir, idxPath)));
      for (let part = 0; part < partCount; part++) {
        const partPath = surfaceTileArchivePath(prefix, product, z, part);
        if (!existsSync(join(imagesDir, partPath))) {
          throw new Error(
            `collectSurfaceTiles: ${idxPath} names part ${part} but ${partPath} is missing`,
          );
        }
        add(partPath);
      }
    }
  }
  return uploads;
}
