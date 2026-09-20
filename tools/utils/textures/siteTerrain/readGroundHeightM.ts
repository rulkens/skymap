import { resolve } from 'node:path';

import type { HeightTile } from '../../../textures/@types/HeightTile';
import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import { surfaceTilePath } from '../../../../src/utils/surfaceTiles/surfaceTilePath';
import { readHeightTileFile } from '../readHeightTileFile';
import { sampleHeightTileM } from './sampleHeightTileM';
import { tilePostAtLatLon } from './tilePostAtLatLon';

/** A seat fit reads thousands of points off a handful of tiles. */
const tiles = new Map<string, Promise<HeightTile | null>>();

/** readGroundHeightM — drawn ground height, metres above the datum, at a
 *  lat/lon on band level `z`, read from that level's locally baked tile file. */
export async function readGroundHeightM(
  manifest: SurfaceTileManifest,
  latDeg: number,
  lonDeg: number,
  z: number,
): Promise<number> {
  const { x, y, colFrac, rowFrac } = tilePostAtLatLon(latDeg, lonDeg, z);
  const rel = surfaceTilePath({ product: 'height', z, x, y }, manifest.prefix);
  let tile = tiles.get(rel);
  if (tile === undefined) {
    tile = readHeightTileFile(resolve(`public/data/images/${rel}`));
    tiles.set(rel, tile);
  }
  const heightTile = await tile;
  if (heightTile === null) {
    throw new Error(`readGroundHeightM: (${latDeg}, ${lonDeg}) names missing tile ${rel}`);
  }
  return sampleHeightTileM(heightTile.heightM, colFrac, rowFrac);
}
