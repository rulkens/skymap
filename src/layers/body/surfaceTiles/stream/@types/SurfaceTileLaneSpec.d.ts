import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from './SurfaceTileSource';
import type { SurfaceTilePayload } from './SurfaceTilePayload';

/** SurfaceTileLaneSpec — one product's atlas geometry, format and fetcher: all
 *  `surfaceTileStream` needs to build that product's lane at engage. */
export type SurfaceTileLaneSpec = {
  /** The atlas's GPU debug label, e.g. `'surface-tiles-albedo'`. */
  readonly label: string;
  readonly atlasSide: number;
  readonly slotSide: number;
  readonly format: GPUTextureFormat;
  readonly fetch: (
    tile: SurfaceTileId,
    source: SurfaceTileSource,
  ) => Promise<SurfaceTilePayload | null>;
};
