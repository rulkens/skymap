import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceTileManifest } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import type { SurfaceTileProduct } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileProduct';
import { decodeSurfaceTileArchiveIndex } from '../../../src/layers/body/surfaceTiles/archive/utils/decodeSurfaceTileArchiveIndex';
import { surfaceTileArchivePath } from '../../../src/layers/body/surfaceTiles/archive/utils/surfaceTileArchivePath';
import type { R2Upload } from '../@types/R2Upload';

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
  const products = new Set(bands.flatMap((band) => Object.keys(band.builtFrom)));
  for (const product of products as Set<SurfaceTileProduct>) {
    const ranged = bands.filter((band) => band.builtFrom[product] !== undefined);
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
