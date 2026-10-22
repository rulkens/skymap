/**
 * BODY_PICK_ROWS — each body's DURABLE seed table, the array a pick tagged
 * with that row's source code indexes into. Total over `BodySourceId`. Pack side:
 * `sceneBodyPickId`; unpack: `bodySelectionRow`'s `resolvePick`. The star
 * sources and the craft have their own tables (`SEEDED_STAR_CATALOGS`,
 * `MISSION_CRAFT_IDS`).
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_PLANETS } from './scenePlanets';
import type { BodySourceId } from '../../@types/data/body/BodySourceId';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

export const BODY_PICK_ROWS: Readonly<
  Record<BodySourceId, readonly { readonly id: SceneBodyId }[]>
> = {
  earth: [SCENE_EARTH],
  planet: SCENE_PLANETS,
};
