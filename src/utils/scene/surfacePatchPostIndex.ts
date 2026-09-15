import { HEIGHT_POSTS_PER_TILE } from '../../data/scene/heightTileFormat';

/**
 * surfacePatchPostIndex — template vertex `(i, j)` → its post in the 129-post
 * height tile, as `[col, row]`. TWIN of the lookup in `earthSurfaceTile/vertex.wesl`,
 * with no production caller by design: a flip here is silent in a screenshot.
 * The anchor's `lat0Rad` is the patch's SOUTH edge and `j` counts north, while a
 * height tile's row 0 is its NORTH row — so `(0, 0)` reads post `[0, 128]`.
 */
export function surfacePatchPostIndex(i: number, j: number, n: number): readonly [number, number] {
  const stride = (HEIGHT_POSTS_PER_TILE - 1) / n;
  return [i * stride, HEIGHT_POSTS_PER_TILE - 1 - j * stride];
}
