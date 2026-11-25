import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from './SurfaceTileSource';
import type { SurfaceTilePayload } from './SurfaceTilePayload';
import type { TextureAtlasConfig } from '../../../../../@types/rendering/TextureAtlasConfig';

/** SurfaceTileLaneSpec — one product's atlas (handed straight to `TextureAtlas`)
 *  and fetcher: all `surfaceTileStream` needs to build that product's lane. */
export type SurfaceTileLaneSpec = TextureAtlasConfig & {
  /** `gates-cut`: a leaf cannot draw without it, so it is requested only where every
   *  gating product is baked,. `standalone`: a leaf
   *  draws without it, so it is requested wherever its own bake exists. */
  readonly role: 'gates-cut' | 'standalone';
  /** The tile pipeline's `@binding` for this product's atlas. */
  readonly binding: number;
  /** `'empty'` is a stored-empty tile, passed through; `null` is missing or failed. */
  readonly fetch: (
    tile: SurfaceTileId,
    source: SurfaceTileSource,
  ) => Promise<SurfaceTilePayload | 'empty' | null>;
};
