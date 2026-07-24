/**
 * atlasTileRect — turn a tile's index in a uniform row-major atlas grid into the
 * pixel rect that tile occupies.
 *
 * ### Why a function, and not rects in the layout
 *
 * The alternative is for the generated layout to carry an explicit
 * `{x, y, w, h}` per tile instead of a bare index. That is what a NON-uniform
 * atlas would force: Saturn's ring strip is a ~16:1 sliver rather than a 2:1
 * equirectangular map, so an atlas containing it has cells of two shapes and no
 * formula recovers a rect from an index alone. The body atlas deliberately holds
 * only `surface` tiles, every one of them 2:1, so the grid is uniform and the
 * rect is a division — cheaper to generate, cheaper to read, and impossible to
 * get internally inconsistent.
 *
 * The rect still exists as a *value* rather than being inlined into the copy
 * call, because `setPlaceholderMap` takes an `AtlasTileRect`: the renderer
 * contract stays shaped for an atlas whose cells are not uniform, and swapping
 * this derivation for per-tile rects later touches no renderer.
 *
 * Coordinates are unflipped (top-left origin), matching
 * `copyExternalImageToTexture`'s source `origin` space.
 */

import type { AtlasTileRect } from '../../@types/data/AtlasTileRect';

export function atlasTileRect(
  index: number,
  columns: number,
  tileSize: { w: number; h: number },
): AtlasTileRect {
  return {
    x: (index % columns) * tileSize.w,
    y: Math.floor(index / columns) * tileSize.h,
    w: tileSize.w,
    h: tileSize.h,
  };
}
