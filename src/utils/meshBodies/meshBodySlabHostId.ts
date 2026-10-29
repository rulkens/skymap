/**
 * meshBodySlabHostId — the body-slab row a mesh-drawn body draws in: its own if it
 * owns one, else its position driver's host when that host owns one; a body hanging
 * off something rowless (the Sun, or nothing) hosts itself.
 *
 * Static by necessity: `HOSTLESS_MESH_BODIES` reads this at module load, before
 * `createLayers` composes `state.slabRows`. Do not thread engine state in here.
 */

import { bodyHostId } from '../../data/bodies/positionDrivers';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../data/bodies/scenePlanets';
import type { PositionedId } from '../../@types/scene/PositionedId';

// The bodies the body Layer declares a `body-m` row for (`BODY_SLAB_ROWS`).
const SLAB_HOST_IDS = new Set<string>([SCENE_EARTH.id, ...SCENE_PLANETS.map((body) => body.id)]);

export function meshBodySlabHostId(id: string): string {
  if (SLAB_HOST_IDS.has(id)) return id;
  const host = bodyHostId(id);
  return host !== null && SLAB_HOST_IDS.has(host) ? host : id;
}
