import { HORIZON_POSTS_PER_TILE } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';

/** A horizon tile at level z is baked as its 4 × 4 descendants at z + 2, each one 33-post march
 *  unit on height's lattice decimated by 4, so a band's horizon levels sit two above its heights'. */
export const HORIZON_SUB_TILE_LEVELS = 2;
export const HORIZON_SUB_TILES_PER_SIDE = 2 ** HORIZON_SUB_TILE_LEVELS;
export const HORIZON_SUB_TILE_POSTS = (HORIZON_POSTS_PER_TILE - 1) / HORIZON_SUB_TILES_PER_SIDE + 1;
