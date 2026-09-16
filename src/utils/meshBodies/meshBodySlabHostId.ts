/**
 * meshBodySlabHostId — the body-slab row a mesh body draws in. It rides its
 * position driver's host (`meshBodiesPass`, the way `ringsPass` rides Saturn's)
 * when that host owns a row; a body hanging off something rowless — the Sun, or
 * nothing at all — hosts itself and gets a row of its own.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import { bodyHostId } from '../../data/bodies/positionDrivers';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../data/bodies/scenePlanets';
import { SCENE_ANCHOR_POINT_BODIES } from '../../data/bodies/sceneAnchorPointBodies';

// The same three tables `frameContext`'s `slabBodyCandidates` composes — the
// hosts that can own a `body-m` row at all. Static, so the set is built once.
const SLAB_HOST_IDS = new Set<string>([
  SCENE_EARTH.id,
  ...SCENE_PLANETS.map((body) => body.id),
  ...SCENE_ANCHOR_POINT_BODIES.map((body) => body.id),
]);

export function meshBodySlabHostId(body: MeshBody): string {
  const host = bodyHostId(body.id);
  return host !== null && SLAB_HOST_IDS.has(host) ? host : body.id;
}
