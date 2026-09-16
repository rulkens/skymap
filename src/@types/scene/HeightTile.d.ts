import type { HeightTileHeader } from './HeightTileHeader';

/** HeightTile — one Terrain-RGB WebP tile (`heightTileFormat.ts`) decoded on
 *  the CPU, as the tools see it: the header plus 129² posts of elevation in
 *  metres above the body's datum sphere. */
export type HeightTile = HeightTileHeader & {
  /** Row-major, NORTH row first, `HEIGHT_POSTS_PER_TILE²` finite entries. */
  readonly heightM: Float32Array;
};
