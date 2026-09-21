/**
 * ORBIT_REACH_BY_REGION — the seeded scene's orbital reach per region, derived
 * once so the orbit-trail cull costs one comparison per region rather than a
 * table walk per frame. Conservative: it never drops a visible CORE orbit.
 *
 * Over `CORE_TRAIL_ELEMENTS`, not `ORBITAL_ELEMENTS`: a mesh body draws no trail
 * to cull, and a hyperbolic row has no apoapsis to contribute a reach from.
 * Rows a Layer contributes are outside this reach.
 */

import type { BodyRegion } from '../../@types/scene/BodyRegion';
import { orbitReachByRegion } from '../../utils/orbit/orbitReachByRegion';
import { regionOfBody } from '../../utils/regions/regionOfBody';
import { CORE_TRAIL_ELEMENTS } from './coreTrailElements';
import { SCENE_ANCHORS } from './sceneAnchors';

export const ORBIT_REACH_BY_REGION: ReadonlyMap<BodyRegion, number> = orbitReachByRegion(
  SCENE_ANCHORS,
  CORE_TRAIL_ELEMENTS,
  regionOfBody,
);
