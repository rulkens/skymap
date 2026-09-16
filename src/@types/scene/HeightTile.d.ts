/**
 * HeightTile — one decoded Terrain-RGB WebP tile (`heightTileFormat.ts`): 129² posts
 * of elevation in metres above the body's datum sphere. `subtreeMin/MaxM`
 * bound the ENTIRE descendant subtree, not just this tile's own posts, so a
 * coarse-tile horizon/occlusion test stays conservative for everything under it.
 */
export type HeightTile = {
  readonly subtreeMinM: number;
  readonly subtreeMaxM: number;
  /** Max |this level's bilinear − the finest level| inside the tile, metres. */
  readonly geometricResidualM: number;
  /** Row-major, NORTH row first, `HEIGHT_POSTS_PER_TILE²` finite entries. */
  readonly heightM: Float32Array;
};
