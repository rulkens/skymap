import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';

/** SurfaceTileSource — where a tile's encoded bytes come from, so the fetchers
 *  only decode and never learn whether tiles are loose files or in an archive. */
export type SurfaceTileSource = {
  /** The tile's encoded bytes, or `null` when absent or unreadable. Never throws. */
  readonly readTile: (tile: SurfaceTileId) => Promise<Uint8Array<ArrayBuffer> | null>;
};
