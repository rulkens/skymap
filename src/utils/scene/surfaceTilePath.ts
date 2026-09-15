import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';
import type { SurfaceTileProduct } from '../../@types/data/SurfaceTileProduct';

/** On-disk extension per product: `albedo` is a lossy WebP (alpha doubles as
 *  the land mask, so JPEG can't carry it); `height` is the raw `shgt1`
 *  binary format (`heightTileFormat.ts`), never a raster container. */
const EXT: Record<SurfaceTileProduct, string> = { albedo: 'webp', height: 'bin' };

/**
 * surfaceTilePath — the single home for a virtual-texture tile's path, called
 * by BOTH the build tool and the runtime fetcher: a name constructed twice is
 * a name that eventually 404s.
 *
 * `prefix` comes from the manifest rather than a constant here, so a re-bake
 * under a new version is a data change on both sides at once.
 */
export function surfaceTilePath(tile: SurfaceTileId, prefix: string): string {
  return `${prefix}/${tile.product}/${tile.z}/${tile.x}/${tile.y}.${EXT[tile.product]}`;
}
