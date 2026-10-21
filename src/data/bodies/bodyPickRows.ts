/**
 * BODY_PICK_ROWS — each body's DURABLE seed table, the array a pick tagged
 * with that row's source code indexes into. Total over `BodyId`. Pack side:
 * `sceneBodyPickId`; unpack: `bodySelectionRow`'s `resolvePick`. The star
 * sources and the craft have their own tables (`SEEDED_STAR_CATALOGS`,
 * `MISSION_CRAFT_IDS`).
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_PLANETS } from './scenePlanets';
import type { BodyId } from '../../@types/data/body/BodyId';

export const BODY_PICK_ROWS: Readonly<Record<BodyId, readonly { readonly id: string }[]>> = {
  earth: [SCENE_EARTH],
  planet: SCENE_PLANETS,
};
