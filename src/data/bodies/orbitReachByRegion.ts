/**
 * ORBIT_REACH_BY_REGION — the seeded scene's orbital reach per region, derived
 * once so the orbit-trail cull costs one comparison per region rather than a
 * table walk per frame. Conservative: it never drops a visible orbit.
 */

import type { BodyRegion } from '../../@types/scene/BodyRegion';
import { orbitReachByRegion } from '../../utils/orbit/orbitReachByRegion';
import { regionOfBody } from '../../utils/scene/regionOfBody';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_ANCHORS } from './sceneAnchors';

export const ORBIT_REACH_BY_REGION: ReadonlyMap<BodyRegion, number> = orbitReachByRegion(
  SCENE_ANCHORS,
  ORBITAL_ELEMENTS,
  regionOfBody,
);
