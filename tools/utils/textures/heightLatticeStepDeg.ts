import { HEIGHT_POSTS_PER_TILE } from '../../../src/data/scene/heightTileFormat';

/**
 * Angular spacing of the global height lattice at level `z`, in degrees —
 * the same in longitude and latitude, since a surface tile is square in
 * degrees (`earthTileBounds`).
 *
 * Posts per tile EDGE is 129 but the lattice step divides the tile into 128
 * intervals: the 129th post is the neighbouring tile's first, which is the
 * whole of §5.4's exact edge agreement. Level `z − 1`'s lattice is exactly
 * every other point of level `z`'s, so decimation is lossless at shared
 * points (§5.4.3).
 */
export function heightLatticeStepDeg(z: number): number {
  return 360 / (2 ** z * (HEIGHT_POSTS_PER_TILE - 1));
}
