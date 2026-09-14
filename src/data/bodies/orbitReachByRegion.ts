/**
 * ORBIT_REACH_BY_REGION — the seeded scene's orbital reach per region, derived
 * once so the orbit-trail cull costs one comparison per region rather than a
 * table walk per frame. Conservative: it never drops a visible orbit.
 *
 * Over `TRAIL_ELEMENTS`, not `ORBITAL_ELEMENTS`: only those rows draw a trail
 * to cull, and a hyperbolic row has no apoapsis to contribute a reach from.
 */

import type { BodyRegion } from '../../@types/scene/BodyRegion';
import { orbitReachByRegion } from '../../utils/orbit/orbitReachByRegion';
import { regionOfBody } from '../../utils/scene/regionOfBody';
import { TRAIL_ELEMENTS } from './trailElements';
import { SCENE_ANCHORS } from './sceneAnchors';

export const ORBIT_REACH_BY_REGION: ReadonlyMap<BodyRegion, number> = orbitReachByRegion(
  SCENE_ANCHORS,
  TRAIL_ELEMENTS,
  regionOfBody,
);
