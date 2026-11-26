import type { HeightPyramid } from './@types/HeightPyramid';
import type { HorizonSubTile } from './@types/HorizonSubTile';
import { HEIGHT_POSTS_PER_TILE } from '../../../src/layers/body/surfaceTiles/format/data/heightTileFormat';
import { HORIZON_SECTORS } from '../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { horizonByteOfAngle } from '../../../src/layers/body/surfaceTiles/horizon/utils/horizonByteOfAngle';
import { horizonTexelOf } from '../../../src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf';
import { heightLatticeStepDeg } from '../../utils/textures/heightLatticeStepDeg';
import { HORIZON_SUB_TILE_POSTS } from './data/horizonSubTiles';
import { marchCeilingM } from './utils/marchCeilingM';
import { marchHorizonSector } from './utils/marchHorizonSector';

const DEG = Math.PI / 180;
const DECIMATION = (HEIGHT_POSTS_PER_TILE - 1) / (HORIZON_SUB_TILE_POSTS - 1);

/** bakeHorizonSubTile — the bake's march unit: the horizon angles of level-z tile (x, y) at
 *  33 × 33 posts, every sector, packed into the 2×2-texel-per-post raster; posts sit on height's
 *  lattice, so (0,0) is the NW corner. `assembleHorizonTile` stitches 16 of these into one shipped
 *  tile. `march` is called in the same (post, sector) order on every call. */
export function bakeHorizonSubTile(
  pyramid: HeightPyramid,
  z: number,
  x: number,
  y: number,
  march: typeof marchHorizonSector = marchHorizonSector,
): HorizonSubTile {
  const side = 2 * HORIZON_SUB_TILE_POSTS;
  const stepRad = heightLatticeStepDeg(z) * DEG;
  const ceilingM = marchCeilingM(pyramid, z, x, y);
  if (!Number.isFinite(ceilingM)) {
    throw new Error(`bakeHorizonSubTile: march ceiling ${ceilingM} for tile ${z}/${x}/${y}`);
  }
  const rgba = new Uint8Array(side * side * 4);
  let maxDeg = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < HORIZON_SUB_TILE_POSTS; j++) {
    const latRad = Math.PI / 2 - (y * (HEIGHT_POSTS_PER_TILE - 1) + j * DECIMATION) * stepRad;
    for (let i = 0; i < HORIZON_SUB_TILE_POSTS; i++) {
      const lonRad = -Math.PI + (x * (HEIGHT_POSTS_PER_TILE - 1) + i * DECIMATION) * stepRad;
      for (let sector = 0; sector < HORIZON_SECTORS; sector++) {
        const azimuthRad = (sector * 2 * Math.PI) / HORIZON_SECTORS;
        const deg = march(pyramid, z, lonRad, latRad, azimuthRad, ceilingM);
        maxDeg = Math.max(maxDeg, deg);
        const { dx, dy, channel } = horizonTexelOf(sector);
        rgba[((2 * j + dy) * side + 2 * i + dx) * 4 + channel] = horizonByteOfAngle(deg);
      }
    }
  }
  return { rgba, maxDeg };
}
