/**
 * BODY_SCENE_BODY_IDS — the scene bodies the body Layer's passes draw, by id: `SCENE_PLANETS`.
 * Every other body-slab body belongs to another Layer (the missions craft, the earthScenes park),
 * drawn by that Layer's passes. The partition only ever sees present bodies, so a static set needs no
 * snapshot.
 */

import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

export const BODY_SCENE_BODY_IDS: ReadonlySet<string> = new Set(
  SCENE_PLANETS.map((body) => body.id),
);
