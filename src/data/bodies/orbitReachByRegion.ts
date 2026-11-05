/**
 * ORBIT_REACH_BY_REGION — orbital reach per region, derived once so the orbit-trail cull is
 * one comparison per region per frame. Conservative: never drops a visible orbit.
 *
 * Over the non-mesh `ORBITAL_ELEMENTS`, not `BODY_TRAIL_ELEMENTS`: the galactic-centre
 * region's reach must still count the S-star orbits, whose trail is the star Layer's.
 */

import type { BodyRegion } from '../../@types/scene/BodyRegion';
import { orbitReachByRegion } from '../../utils/orbit/orbitReachByRegion';
import { regionOfBody } from '../../utils/regions/regionOfBody';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_ANCHORS } from './sceneAnchors';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

const MESH_BODY_IDS = new Set(SCENE_MESH_BODIES.map((body) => body.id));
const NON_MESH_ORBITAL_ELEMENTS = ORBITAL_ELEMENTS.filter((el) => !MESH_BODY_IDS.has(el.id));

export const ORBIT_REACH_BY_REGION: ReadonlyMap<BodyRegion, number> = orbitReachByRegion(
  SCENE_ANCHORS,
  NON_MESH_ORBITAL_ELEMENTS,
  regionOfBody,
);
