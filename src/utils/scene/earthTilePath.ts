import type { EarthTileId } from '../../@types/data/EarthTileId';

/**
 * earthTilePath — the single home for a virtual-texture tile's path, called
 * by BOTH the build tool and the runtime fetcher: a name constructed twice is
 * a name that eventually 404s. Lossy WebP because JPEG can't carry the alpha
 * channel that doubles as the land mask.
 *
 * `prefix` comes from the manifest rather than a constant here, so a re-bake
 * under a new version is a data change on both sides at once.
 */
export function earthTilePath(tile: EarthTileId, prefix: string): string {
  return `${prefix}/${tile.kind}/${tile.z}/${tile.x}/${tile.y}.webp`;
}
