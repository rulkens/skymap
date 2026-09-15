import { HEIGHT_POSTS_PER_TILE } from '../../data/scene/heightTileFormat';

/** surfacePatchPostIndex — template vertex `(i, j)` → its post `[col, row]`.
 *  TWIN of the lookup in `earthSurfaceTile/vertex.wesl`; a height tile's row 0
 *  is its NORTH row while `j` counts north, so `(0, 0)` reads post `[0, 128]`. */
export function surfacePatchPostIndex(i: number, j: number, n: number): readonly [number, number] {
  const stride = (HEIGHT_POSTS_PER_TILE - 1) / n;
  return [i * stride, HEIGHT_POSTS_PER_TILE - 1 - j * stride];
}
