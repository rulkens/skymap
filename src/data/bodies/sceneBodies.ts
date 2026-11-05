/**
 * SCENE_BODIES — the flat registry the `body-<id>` focus-id resolver and the selection-row
 * extractor look up. Membership is what makes a body focusable and selectable AT ALL: both
 * consumers return null on a miss, so an omitted body fails silently. Consumers touch only the
 * fields the `SceneBody` union shares (`id`, `label`).
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_STARS } from './sceneStars';
import { SCENE_SUN } from './sceneSun';
import { SCENE_PLANETS } from './scenePlanets';
import { SCENE_S_STARS } from './sceneSStars';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';
import type { SceneBody } from '../../@types/scene/SceneBody';

export const SCENE_BODIES: readonly SceneBody[] = [
  SCENE_EARTH,
  ...SCENE_SUN,
  ...SCENE_STARS,
  ...SCENE_PLANETS,
  ...SCENE_S_STARS,
  ...SCENE_MESH_BODIES,
];
