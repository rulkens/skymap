import { HEIGHT_POSTS_PER_TILE } from '../../../src/data/scene/heightTileFormat';

/** Angular spacing of the global height lattice at level `z`, in degrees,
 *  same in both axes: 129 posts per tile edge is 128 intervals, the 129th
 *  post being the neighbour tile's first (§5.4's exact edge agreement), over
 *  2^z tiles per 360° — which assumes `EARTH_TILE_PX` is the base width. */
export function heightLatticeStepDeg(z: number): number {
  return 360 / (2 ** z * (HEIGHT_POSTS_PER_TILE - 1));
}
