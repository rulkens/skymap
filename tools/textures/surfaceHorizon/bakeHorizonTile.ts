import type { HeightPyramid } from './@types/HeightPyramid';
import type { HorizonTile } from './@types/HorizonTile';
import { HEIGHT_POSTS_PER_TILE } from '../../../src/layers/body/surfaceTiles/format/data/heightTileFormat';
import {
  HORIZON_POSTS_PER_TILE,
  HORIZON_SECTORS,
} from '../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { horizonByteOfAngle } from '../../../src/layers/body/surfaceTiles/horizon/utils/horizonByteOfAngle';
import { horizonTexelOf } from '../../../src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf';
import { heightLatticeStepDeg } from '../../utils/textures/heightLatticeStepDeg';
import { marchCeilingM } from './utils/marchCeilingM';
import { marchHorizonSector } from './utils/marchHorizonSector';

/** Under this everywhere, a tile ships as flat (fully lit): its slopes stay under ~1°, so
 *  N·L is already near zero wherever the sun is that low (spec §3). */
const FLAT_MAX_DEG = 1;
const DEG = Math.PI / 180;
const DECIMATION = (HEIGHT_POSTS_PER_TILE - 1) / (HORIZON_POSTS_PER_TILE - 1);

/** bakeHorizonTile — the horizon angles of tile (z, x, y), every post and sector, packed into
 *  the 2×2-texel-per-post raster; posts sit on height's lattice, so (0,0) is the NW corner. */
export function bakeHorizonTile(
  pyramid: HeightPyramid,
  z: number,
  x: number,
  y: number,
): HorizonTile {
  const side = 2 * HORIZON_POSTS_PER_TILE;
  const stepRad = heightLatticeStepDeg(z) * DEG;
  const ceilingM = marchCeilingM(pyramid, z, x, y);
  if (!Number.isFinite(ceilingM)) {
    throw new Error(`bakeHorizonTile: march ceiling ${ceilingM} for tile ${z}/${x}/${y}`);
  }
  const rgba = new Uint8Array(side * side * 4);
  let maxDeg = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < HORIZON_POSTS_PER_TILE; j++) {
    const latRad = Math.PI / 2 - (y * (HEIGHT_POSTS_PER_TILE - 1) + j * DECIMATION) * stepRad;
    for (let i = 0; i < HORIZON_POSTS_PER_TILE; i++) {
      const lonRad = -Math.PI + (x * (HEIGHT_POSTS_PER_TILE - 1) + i * DECIMATION) * stepRad;
      for (let sector = 0; sector < HORIZON_SECTORS; sector++) {
        const azimuthRad = (sector * 2 * Math.PI) / HORIZON_SECTORS;
        const deg = marchHorizonSector(pyramid, z, lonRad, latRad, azimuthRad, ceilingM);
        maxDeg = Math.max(maxDeg, deg);
        const { dx, dy, channel } = horizonTexelOf(sector);
        rgba[((2 * j + dy) * side + 2 * i + dx) * 4 + channel] = horizonByteOfAngle(deg);
      }
    }
  }
  return maxDeg < FLAT_MAX_DEG ? { kind: 'flat' } : { kind: 'image', rgba };
}
