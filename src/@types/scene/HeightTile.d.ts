/**
 * HeightTile — one decoded `shgt1` tile (`heightTileFormat.ts`): 129² posts of
 * elevation in metres above the body's datum sphere, plus the three header
 * scalars the walk reads without touching the payload.
 *
 * `subtreeMinM`/`subtreeMaxM` bound this tile's ENTIRE descendant subtree at
 * the finest baked data, not just its own posts — that is what lets a horizon
 * or occlusion test on a coarse tile stay conservative for everything under it.
 */
export type HeightTile = {
  readonly subtreeMinM: number;
  readonly subtreeMaxM: number;
  /** Max |this level's bilinear − the finest level| inside the tile, metres. */
  readonly geometricResidualM: number;
  /** Row-major, NORTH row first, `HEIGHT_POSTS_PER_TILE²` finite entries. */
  readonly heightM: Float32Array;
};
