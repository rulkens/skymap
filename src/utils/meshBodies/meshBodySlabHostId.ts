/**
 * meshBodySlabHostId — the body-slab row a mesh body draws in. It rides its
 * position driver's host (`meshBodiesPass`, the way `ringsPass` rides Saturn's)
 * when that host owns a row; a body hanging off something rowless — the Sun, or
 * nothing at all — hosts itself and gets a row of its own.
 *
 * Static by necessity, not by choice: `HOSTLESS_MESH_BODIES` reads this at
 * module load, long before `createLayers` composes `state.slabRows`, so a
 * Layer's own row cannot host a mesh body until the body Layer forms. Do not
 * thread engine state in here to fix that.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import { bodyHostId } from '../../data/bodies/positionDrivers';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../data/bodies/scenePlanets';

// The store halves `frameContext`'s `slabBodyCandidates` composes — the hosts
// that can own a `body-m` row and a mesh body alike.
const SLAB_HOST_IDS = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((body) => body.id)]);

export function meshBodySlabHostId(body: MeshBody): string {
  const host = bodyHostId(body.id);
  return host !== null && SLAB_HOST_IDS.has(host) ? host : body.id;
}
