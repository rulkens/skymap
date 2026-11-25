import type { HorizonTile } from '../@types/HorizonTile';
import type { LazyHeightPyramid } from '../@types/LazyHeightPyramid';
import { bakeHorizonTile } from '../bakeHorizonTile';

/** bakeHorizonTileResolved — `bakeHorizonTile`, re-run until a pass reads only decoded tiles.
 *  A pass that touched an undecoded tile saw 0 m there and is discarded; each retry decodes
 *  what the last one missed, and the far field's reach is bounded, so it converges. */
export async function bakeHorizonTileResolved(
  pyramid: LazyHeightPyramid,
  z: number,
  x: number,
  y: number,
): Promise<HorizonTile> {
  for (;;) {
    const tile = bakeHorizonTile(pyramid, z, x, y);
    if ((await pyramid.loadMisses()) === 0) return tile;
  }
}
