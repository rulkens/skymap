import type { HeightTileHeader } from '../../../src/@types/scene/HeightTileHeader';

/** HeightTile — one Terrain-RGB WebP tile (`heightTileFormat.ts`) decoded on
 *  the CPU, as the tools see it: the header plus 129² posts of elevation in
 *  metres above the body's datum sphere. No `gridCodes`: the header's post grid
 *  is derived from `heightM` when the tile is encoded, so a tile the bake has
 *  built but not yet written does not have one. */
export type HeightTile = Omit<HeightTileHeader, 'gridCodes'> & {
  /** Row-major, NORTH row first, `HEIGHT_POSTS_PER_TILE²` finite entries. */
  readonly heightM: Float32Array;
};
