/**
 * clippedImagerySource — narrow a source's coverage to `extent`, decline
 * every box that shares no area with it, and fade alpha to zero across the
 * ring between `core` and `extent` so the underfill shows through with no
 * hard edge. A HiRISE ortho spans kilometres more than its site band, and a
 * childless halo tile at z10 would otherwise read it all at 25 cm.
 */

import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { featherWeight } from '../utils/textures/featherWeight';
import type { SurfaceImagerySource } from './@types/SurfaceImagerySource';

export function clippedImagerySource(
  source: SurfaceImagerySource,
  /** Snapped to the band's deepest tile grid, so no baked tile straddles it. */
  extent: LonLatBounds,
  core: LonLatBounds,
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
      if (!overlaps) return null;
      const raster = await source.readBox(box, widthPx, heightPx);
      if (raster === null) return null;
      for (let py = 0; py < heightPx; py++) {
        const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
        for (let px = 0; px < widthPx; px++) {
          const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
          const alpha = (py * widthPx + px) * 4 + 3;
          raster[alpha] = Math.round(raster[alpha]! * featherWeight(extent, core, lon, lat));
        }
      }
      return raster;
    },
  };
}
