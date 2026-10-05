/**
 * ORBIT_REACH_BY_REGION — the seeded scene's orbital reach per region, derived
 * once so the orbit-trail cull costs one comparison per region rather than a
 * table walk per frame. Conservative: it never drops a visible CORE orbit.
 *
 * Over the non-mesh `ORBITAL_ELEMENTS`, not `CORE_TRAIL_ELEMENTS`: the
 * galactic-centre region's reach must still count the S-star orbits even
 * though their TRAIL is now the star Layer's `guides.orbitTrails`, not core's
 * — reworking this into a roster-derived reach is the backlog item.
 */

import type { BodyRegion } from '../../@types/scene/BodyRegion';
import { orbitReachByRegion } from '../../utils/orbit/orbitReachByRegion';
import { regionOfBody } from '../../utils/regions/regionOfBody';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_ANCHORS } from './sceneAnchors';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

// Re-derives the same id set `coreTrailElements.ts` computes; both are leaf
// data modules, so sharing would add an edge rather than remove duplication.
const MESH_BODY_IDS = new Set(SCENE_MESH_BODIES.map((body) => body.id));
const NON_MESH_ORBITAL_ELEMENTS = ORBITAL_ELEMENTS.filter((el) => !MESH_BODY_IDS.has(el.id));

export const ORBIT_REACH_BY_REGION: ReadonlyMap<BodyRegion, number> = orbitReachByRegion(
  SCENE_ANCHORS,
  NON_MESH_ORBITAL_ELEMENTS,
  regionOfBody,
);
