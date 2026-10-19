/**
 * meshBodySlabHostId — the body-slab row a mesh-drawn body draws in. A body that
 * owns a row (a celestial body drawn from a shape model) draws in its own. Any
 * other rides its position driver's host (`meshBodiesPass`, the way `ringsPass`
 * rides Saturn's) when that host owns a row; one hanging off something rowless —
 * the Sun, or nothing at all — hosts itself and gets a row of its own.
 *
 * Static by necessity, not by choice: `HOSTLESS_MESH_BODIES` reads this at
 * module load, long before `createLayers` composes `state.slabRows`, so a
 * Layer's own row cannot host a mesh body until the body Layer forms. Do not
 * thread engine state in here to fix that.
 */

import { bodyHostId } from '../../data/bodies/positionDrivers';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../data/bodies/scenePlanets';

// The store halves `frameContext`'s `slabBodyCandidates` composes — the hosts
// that can own a `body-m` row and a mesh body alike.
const SLAB_HOST_IDS = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((body) => body.id)]);

export function meshBodySlabHostId(id: string): string {
  if (SLAB_HOST_IDS.has(id)) return id;
  const host = bodyHostId(id);
  return host !== null && SLAB_HOST_IDS.has(host) ? host : id;
}
