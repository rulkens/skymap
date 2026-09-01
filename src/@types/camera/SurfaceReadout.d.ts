import type { LonLatDeg } from '../scene/LonLatDeg';

/**
 * KML LookAt semantics at the ENU of the point under the screen centre.
 * `tiltRad` is measured from local NADIR (0 = straight down, π = zenith) —
 * never Cesium's complementary pitch; the datum is in the field name because
 * carrying both conventions is how they get mixed (DESIGN-INPUT §2d).
 */
export type SurfaceReadout = {
  readonly standpoint: LonLatDeg;
  readonly headingRad: number;
  readonly tiltRad: number;
  readonly rangeM: number;
  readonly altitudeM: number;
};
