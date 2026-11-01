/**
 * BODY_SCENE_BODY_IDS: the scene bodies the body Layer's passes draw (`SCENE_PLANETS`).
 * Every other body-slab body belongs to another Layer. The partition only sees
 * present bodies, so a static set needs no snapshot.
 */

import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

export const BODY_SCENE_BODY_IDS: ReadonlySet<string> = new Set(
  SCENE_PLANETS.map((body) => body.id),
);
