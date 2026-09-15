/**
 * SitePose — the site turntable's whole state: four numbers, roll-free, always
 * looking at the site. `siteId` is the mesh body's id, which is also its
 * `SURFACE_FIXED_SITES` row id and its `PositionDriver` id.
 */

import type { BodyId } from '../data/body/BodyId';

export type SitePose = {
  readonly siteId: BodyId;
  /** Azimuth of the EYE as seen from the site, radians, north → east. */
  readonly headingRad: number;
  /** Elevation of the eye above the site's tangent plane, radians. */
  readonly elevationRad: number;
  /** Eye ← site distance, metres. */
  readonly rangeM: number;
};
