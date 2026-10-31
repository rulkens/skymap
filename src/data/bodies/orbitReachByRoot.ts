/**
 * ORBIT_REACH_BY_ROOT — orbital reach per root anchor (the Sun, the Galactic Centre, a planet
 * host), derived once so the orbit-trail cull is one comparison per root per frame.
 * Conservative: never drops a visible orbit.
 *
 * Over the non-mesh `ORBITAL_ELEMENTS`, not `BODY_TRAIL_ELEMENTS`: the Galactic Centre's
 * reach must still count the S-star orbits, whose trail is the star Layer's.
 */

import type { PositionedId } from '../../@types/scene/PositionedId';
import { orbitReachByRoot } from '../../utils/orbit/orbitReachByRoot';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_ANCHORS } from './sceneAnchors';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

const MESH_BODY_IDS = new Set(SCENE_MESH_BODIES.map((body) => body.id));
const NON_MESH_ORBITAL_ELEMENTS = ORBITAL_ELEMENTS.filter((el) => !MESH_BODY_IDS.has(el.id));

export const ORBIT_REACH_BY_ROOT: ReadonlyMap<PositionedId, number> = orbitReachByRoot(
  SCENE_ANCHORS,
  NON_MESH_ORBITAL_ELEMENTS,
);
