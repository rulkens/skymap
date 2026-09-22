/**
 * starRowDriver — the `DriverGeometry` a star's selection arm stamps, for the
 * fixtures that hand-assemble a `starCatalog` row. One radius is hull, ground
 * and footprint at once; a survey star poses from no table, so its `poseId` is
 * null. Same churn rationale as `makeGalaxyRow`: one edit when the shape grows.
 */

import { SURFACE_STANDOFF_RADII } from '../../src/utils/camera/clampDistance';

import type { DriverGeometry } from '../../src/@types/engine/camera/DriverGeometry';

export function starRowDriver(poseId: string | null, radiusM: number): DriverGeometry {
  return {
    poseId,
    boundingRadiusM: radiusM,
    footprintRadiusM: radiusM,
    groundRadiusM: radiusM,
    standoffRadii: SURFACE_STANDOFF_RADII,
  };
}
