/**
 * SCENE_BODIES — the flat registry the `body-<id>` focus-id resolver and the
 * selection-row extractor look up. Seeding a new body is a row in its Layer's
 * `bodies/` (Earth, planets, moons, craft; `sceneEarth`/`scenePlanets` project the
 * fold) or a line in a seed table (`sceneStars`, `sceneSun`, `sceneSStars`) — no
 * parallel list to keep in sync. Palette search no longer reads it: each Layer's
 * `search` feed makes its own rows searchable. Membership is what makes a body
 * focusable and selectable AT ALL: both consumers return null on a miss, so an
 * omitted body fails silently rather than loudly. Consumers only touch the
 * fields the `SceneBody` union shares (`id`, `label`); a body's size and
 * position are not among them — see `SceneBody.d.ts` and `deriveBodyStates`.
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
