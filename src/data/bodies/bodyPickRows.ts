/**
 * BODY_PICK_ROWS — each body's DURABLE seed table, the array a pick tagged
 * with that row's source code indexes into. Total over `BodyId`. Pack side:
 * `sceneBodyPickId`; unpack: `resolvePickTable`'s `body` arm. The Sun's row
 * is unreachable — its dot is drawn by the STAR layers under `Source.FamousStar`.
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_PLANETS } from './scenePlanets';
import { SCENE_STARS } from './sceneStars';
import { SGR_A_STAR } from './sceneSgrAStar';
import { SCENE_S_STARS } from './sceneSStars';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';
import type { BodyId } from '../../@types/data/body/BodyId';

export const BODY_PICK_ROWS: Readonly<Record<BodyId, readonly { readonly id: string }[]>> = {
  earth: [SCENE_EARTH],
  planet: SCENE_PLANETS,
  sun: SCENE_STARS,
  'sgr-a-star': [SGR_A_STAR],
  's-star': SCENE_S_STARS,
  'mesh-body': SCENE_MESH_BODIES,
};
