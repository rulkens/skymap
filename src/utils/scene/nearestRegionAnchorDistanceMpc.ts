/**
 * nearestRegionAnchorDistanceMpc — the camera's distance to whichever scene
 * anchor is closest: the render origin, or any `BODY_REGIONS` anchor (the
 * Sun again, or Sgr A*). Feeds near-field approach bands that must fire
 * wherever the camera actually is, not only near the heliocentric origin —
 * a band keyed on raw `hypot(camPos)` never closes at the galactic centre,
 * since 8.2 kpc from the Sun reads as "far" even standing at Sgr A* itself.
 * An unresolved anchor reads Infinity (`regionRelativeDistanceMpc`) and
 * drops out of the min.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { BodyState } from '../../@types/scene/BodyState';
import { BODY_REGIONS } from '../../data/bodies/bodyRegions';
import { regionRelativeDistanceMpc } from './regionRelativeDistanceMpc';

export function nearestRegionAnchorDistanceMpc(
  camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>,
): number {
  const originDistMpc = Math.hypot(camPosMpc[0], camPosMpc[1], camPosMpc[2]);
  return BODY_REGIONS.reduce(
    (nearest, region) => Math.min(nearest, regionRelativeDistanceMpc(camPosMpc, region, states)),
    originDistMpc,
  );
}
