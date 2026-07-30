import type { EarthTileId } from '../../@types/data/EarthTileId';

/**
 * earthTilePath — the single home for a virtual-texture tile's path, called
 * by BOTH the build tool and the runtime fetcher: a name constructed twice is
 * a name that eventually 404s. Lossy WebP because JPEG can't carry the alpha
 * channel that doubles as the land mask.
 */
export function earthTilePath(tile: EarthTileId): string {
  return `earth-tiles/${tile.kind}/${tile.z}/${tile.x}/${tile.y}.webp`;
}
