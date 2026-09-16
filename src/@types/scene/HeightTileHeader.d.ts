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
  /** The §8.4 post grid: `HEIGHT_GRID_POSTS_PER_EDGE²` Terrain-RGB codes, row-major,
   *  NORTH row first, byte-identical to the image pixels the shader reads. Kept
   *  encoded — decode a post with `codeHeightM` at read time, so a resident tile
   *  costs its 867 bytes and not an f32 array four times that. */
  readonly gridCodes: Uint8Array;
};
