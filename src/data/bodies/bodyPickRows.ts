/**
 * BODY_PICK_ROWS — each body's DURABLE seed table, the array a pick tagged
 * with that row's source code indexes into. Total over `BodyId`. Pack side:
 * `sceneBodyPickId`; unpack: `bodySelectionRow`'s `resolvePick`. The star
 * sources have their own tables (`SEEDED_STAR_CATALOGS`).
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_PLANETS } from './scenePlanets';
import { SGR_A_STAR } from './sceneSgrAStar';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';
import type { BodyId } from '../../@types/data/body/BodyId';

export const BODY_PICK_ROWS: Readonly<Record<BodyId, readonly { readonly id: string }[]>> = {
  earth: [SCENE_EARTH],
  planet: SCENE_PLANETS,
  'sgr-a-star': [SGR_A_STAR],
  'mesh-body': SCENE_MESH_BODIES,
};
