import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from './SurfaceTileSource';
import type { SurfaceTilePayload } from './SurfaceTilePayload';
import type { TextureAtlasConfig } from '../../../../../@types/rendering/TextureAtlasConfig';

/** SurfaceTileLaneSpec — one product's atlas (handed straight to `TextureAtlas`)
 *  and fetcher: all `surfaceTileStream` needs to build that product's lane. */
export type SurfaceTileLaneSpec = TextureAtlasConfig & {
  /** `'empty'` is a stored-empty tile, passed through; `null` is missing or failed. */
  readonly fetch: (
    tile: SurfaceTileId,
    source: SurfaceTileSource,
  ) => Promise<SurfaceTilePayload | 'empty' | null>;
};
