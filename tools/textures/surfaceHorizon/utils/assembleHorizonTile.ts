import { HORIZON_POSTS_PER_TILE } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import type { HorizonSubTile } from '../@types/HorizonSubTile';
import type { HorizonTile } from '../@types/HorizonTile';
import {
  HORIZON_SUB_TILE_LEVELS,
  HORIZON_SUB_TILE_POSTS,
  HORIZON_SUB_TILES_PER_SIDE,
} from '../data/horizonSubTiles';

/** Under this everywhere, a tile ships as flat (fully lit): its slopes stay under ~1°, so
 *  N·L is already near zero wherever the sun is that low (spec §3). */
const FLAT_MAX_DEG = 1;
const SIDE = 2 * HORIZON_POSTS_PER_TILE;
const SUB_SIDE = 2 * HORIZON_SUB_TILE_POSTS;
const SUB_STEP = 2 * (HORIZON_SUB_TILE_POSTS - 1);
const FLAT_SUB_TILE = new Uint8Array(SUB_SIDE * SUB_SIDE * 4);

/**
 * assembleHorizonTile — horizon tile (z, x, y) from its 16 sub-tiles at z + 2, each baked by
 * `bakeSubTile`, so every post holds the value a sub-tile march gave it. Neighbouring sub-tiles
 * share an edge post; written in row-major order, the east or south one's post 0 wins, so only
 * the tile's own last post row and column come from a post 32. A sub-tile under 1° everywhere
 * writes byte 0, as its flat zero-byte tile read; flat when every sub-tile is.
 */
export async function assembleHorizonTile(
  bakeSubTile: (z: number, x: number, y: number) => Promise<HorizonSubTile>,
  z: number,
  x: number,
  y: number,
): Promise<HorizonTile> {
  const rgba = new Uint8Array(SIDE * SIDE * 4);
  let maxDeg = Number.NEGATIVE_INFINITY;
  for (let b = 0; b < HORIZON_SUB_TILES_PER_SIDE; b++) {
    for (let a = 0; a < HORIZON_SUB_TILES_PER_SIDE; a++) {
      const sub = await bakeSubTile(
        z + HORIZON_SUB_TILE_LEVELS,
        x * HORIZON_SUB_TILES_PER_SIDE + a,
        y * HORIZON_SUB_TILES_PER_SIDE + b,
      );
      maxDeg = Math.max(maxDeg, sub.maxDeg);
      const bytes = sub.maxDeg < FLAT_MAX_DEG ? FLAT_SUB_TILE : sub.rgba;
      for (let row = 0; row < SUB_SIDE; row++) {
        const from = row * SUB_SIDE * 4;
        rgba.set(
          bytes.subarray(from, from + SUB_SIDE * 4),
          ((b * SUB_STEP + row) * SIDE + a * SUB_STEP) * 4,
        );
      }
    }
  }
  return maxDeg < FLAT_MAX_DEG ? { kind: 'flat' } : { kind: 'image', rgba };
}
