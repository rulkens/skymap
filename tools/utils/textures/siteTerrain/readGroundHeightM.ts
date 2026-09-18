import { resolve } from 'node:path';

import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import { surfaceTilePath } from '../../../../src/utils/surfaceTiles/surfaceTilePath';
import { readHeightTileFile } from '../readHeightTileFile';
import { sampleHeightTileM } from './sampleHeightTileM';
import { tilePostAtLatLon } from './tilePostAtLatLon';

/** readGroundHeightM — ground height, metres above the datum, at a lat/lon on
 *  band level `z`, read from that level's own locally baked tile file. */
export async function readGroundHeightM(
  manifest: SurfaceTileManifest,
  latDeg: number,
  lonDeg: number,
  z: number,
): Promise<number> {
  const { x, y, colFrac, rowFrac } = tilePostAtLatLon(latDeg, lonDeg, z);
  const rel = surfaceTilePath({ product: 'height', z, x, y }, manifest.prefix);
  const tile = await readHeightTileFile(resolve(`public/data/images/${rel}`));
  if (tile === null) {
    throw new Error(`readGroundHeightM: (${latDeg}, ${lonDeg}) names missing tile ${rel}`);
  }
  return sampleHeightTileM(tile.heightM, colFrac, rowFrac);
}
