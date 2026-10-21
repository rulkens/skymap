/**
 * CORE_SCENE_BODY_IDS — the scene bodies core's own passes draw, by id: `SCENE_PLANETS` and the
 * mesh bodies core still owns. Every other body-slab body is a Layer's (the missions craft),
 * drawn by that Layer's passes. The partition only ever sees present bodies, so a static set
 * needs no snapshot.
 */

import { SCENE_PLANETS } from './scenePlanets';
import { CORE_MESH_BODY_IDS } from './coreMeshBodyIds';

export const CORE_SCENE_BODY_IDS: ReadonlySet<string> = new Set([
  ...SCENE_PLANETS.map((body) => body.id),
  ...CORE_MESH_BODY_IDS,
]);
