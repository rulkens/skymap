/**
 * clippedImagerySource — narrow a source's coverage to `extent` and decline
 * every box that shares no area with it. A HiRISE ortho spans kilometres more
 * than its site band, and a childless halo tile at z10 would otherwise read
 * that whole raster at 25 cm (tens of GB of RGBA).
 */

import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import type { SurfaceImagerySource } from './SurfaceImagerySource';

export function clippedImagerySource(
  source: SurfaceImagerySource,
  /** Snapped to the band's deepest tile grid, so no baked tile straddles it. */
  extent: LonLatBounds,
): SurfaceImagerySource {
  return {
    ...source,
    coverage: [extent],
    async readBox(box, widthPx, heightPx) {
      // Strict: a halo tile sharing only an edge with `extent` must decline.
      const overlaps =
        box.west < extent.east &&
        box.east > extent.west &&
        box.south < extent.north &&
        box.north > extent.south;
      return overlaps ? source.readBox(box, widthPx, heightPx) : null;
    },
  };
}
