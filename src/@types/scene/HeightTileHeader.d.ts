/**
 * HeightTileHeader — a height tile's `SHGT` chunk (`heightTileFormat.ts`).
 * `subtreeMin/MaxM` bound the ENTIRE descendant subtree, not just this tile's
 * own posts, so a coarse-tile horizon/occlusion test stays conservative for
 * everything under it.
 */
export type HeightTileHeader = {
  readonly subtreeMinM: number;
  readonly subtreeMaxM: number;
  /** Max |this level's bilinear − the finest level| inside the tile, metres. */
  readonly geometricResidualM: number;
};
