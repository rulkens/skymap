import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { TileRead } from './TileRead';

/** SurfaceTileSource — where a tile's encoded bytes come from (the level archives), so
 *  the fetchers only decode. */
export type SurfaceTileSource = {
  /** Never throws. */
  readonly readTile: (tile: SurfaceTileId) => Promise<TileRead>;
};
