import type { EarthTileId } from '../../@types/data/EarthTileId';

/**
 * earthTilePath — the single home for a virtual-texture tile's path, relative to
 * the images root, called by BOTH the build tool (`buildEarthTiles`) and the
 * runtime fetcher. The runtime's URL is `dataUrl('images/' + earthTilePath(t))`
 * and the bake writes `public/data/images/` + the same string.
 *
 * Same anti-drift argument as `bodyTextureFilename`: a name constructed twice is
 * a name that eventually 404s. Here the consequence is quieter and therefore
 * worse — a missing whole-globe map shows a blue placeholder, whereas a missing
 * tile degrades silently to the base texture and simply looks like the feature
 * did nothing.
 *
 * The `z/x/y` nesting (rather than one flat directory) is what keeps the tree
 * navigable at hundreds of thousands of objects, and it is the layout every tile
 * server and every offline tile cache already speaks, so an emitted pyramid can
 * be inspected with ordinary tools.
 *
 * Lossy WebP, quality 82: JPEG cannot carry the alpha channel that doubles as
 * the land mask, and at this object count WebP's ~25% saving over JPEG is real
 * money in sync wall-clock. (If Q1 lands on tiling the normal map too, its tiles
 * are LOSSLESS WebP with the same extension — the codec differs, the name does
 * not, exactly as `bodyTextureFilename` already handles.)
 */
export function earthTilePath(tile: EarthTileId): string {
  return `earth-tiles/${tile.kind}/${tile.z}/${tile.x}/${tile.y}.webp`;
}
