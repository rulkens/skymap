/**
 * terrainPickMarkerRadiusM — world radius, metres, for the terrain-pick debug
 * marker: one pixel's footprint at the pick's OWN range times a fixed pixel
 * radius. A fixed world radius would be a sub-pixel dot at 40 km and fill the
 * screen at 100 m; this holds the marker at one apparent size across that band.
 */

import { TERRAIN_PICK_MARKER_RADIUS_PX } from '../../data/debug/terrainPickMarkerRadiusPx';
import { metresPerPixelAtRange } from './metresPerPixelAtRange';

/**
 * @param rangeM eye→pick distance, metres.
 * @param viewportPxHeight the viewport, in the SAME pixel space as
 *   `TERRAIN_PICK_MARKER_RADIUS_PX` (backing-store pixels). A degenerate
 *   viewport answers 0 rather than `Infinity`, which would reach the GPU as
 *   NaN geometry.
 */
export function terrainPickMarkerRadiusM(
  rangeM: number,
  fovYRad: number,
  viewportPxHeight: number,
): number {
  if (!(viewportPxHeight > 0) || !Number.isFinite(rangeM)) return 0;
  return metresPerPixelAtRange(rangeM, fovYRad, viewportPxHeight) * TERRAIN_PICK_MARKER_RADIUS_PX;
}
