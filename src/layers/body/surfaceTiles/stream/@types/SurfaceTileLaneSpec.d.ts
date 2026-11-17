import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from './SurfaceTileSource';
import type { SurfaceTilePayload } from './SurfaceTilePayload';
import type { TextureAtlasConfig } from '../../../../../@types/rendering/TextureAtlasConfig';

/** SurfaceTileLaneSpec — one product's atlas (handed straight to `TextureAtlas`)
 *  and fetcher: all `surfaceTileStream` needs to build that product's lane. */
export type SurfaceTileLaneSpec = TextureAtlasConfig & {
  readonly fetch: (
    tile: SurfaceTileId,
    source: SurfaceTileSource,
  ) => Promise<SurfaceTilePayload | null>;
};
