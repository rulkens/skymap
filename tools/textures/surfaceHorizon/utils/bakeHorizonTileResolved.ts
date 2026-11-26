import type { HorizonTile } from '../@types/HorizonTile';
import type { LazyHeightPyramid } from '../@types/LazyHeightPyramid';
import { bakeHorizonTile } from '../bakeHorizonTile';
import { marchHorizonSector } from './marchHorizonSector';

/** bakeHorizonTileResolved — `bakeHorizonTile`, re-run until no march reads an undecoded tile.
 *  A march that missed saw 0 m there and runs again once its misses decode; one that missed
 *  nothing read only decoded tiles, which never change, so its angle is kept. The far field's
 *  reach is bounded, so it converges. */
export async function bakeHorizonTileResolved(
  pyramid: LazyHeightPyramid,
  z: number,
  x: number,
  y: number,
): Promise<HorizonTile> {
  const finalDeg = new Map<number, number>(); // by the march's call index within a pass
  for (;;) {
    let call = 0;
    const tile = bakeHorizonTile(pyramid, z, x, y, (...args) => {
      const index = call++;
      const known = finalDeg.get(index);
      if (known !== undefined) return known;
      const missesBefore = pyramid.missCount();
      const deg = marchHorizonSector(...args);
      if (pyramid.missCount() === missesBefore) finalDeg.set(index, deg);
      return deg;
    });
    if ((await pyramid.loadMisses()) === 0) return tile;
  }
}
