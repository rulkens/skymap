/**
 * SCENE_BODIES — the flat registry every body-aware consumer reads from: the
 * command-palette search rows, the `body-<id>` focus-id resolver, and the
 * selection-row extractor all iterate / look up this one list. Seeding a new
 * body is a one-line push into its seed table (`sceneEarth`, `sceneStars`,
 * `scenePlanets`, `sceneSgrAStar`, `sceneSStars`) — no parallel list to keep in
 * sync. Membership
 * is what makes a body searchable, focusable and selectable AT ALL: all three
 * consumers return null on a miss, so an omitted body fails silently rather than
 * loudly. Consumers only touch the
 * fields the `SceneBody` union shares (`id`, `label`, `radiusM`); a body's
 * position is not among them, and comes from the `deriveBodyStates` snapshot.
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_STARS } from './sceneStars';
import { SCENE_PLANETS } from './scenePlanets';
import { SGR_A_STAR } from './sceneSgrAStar';
import { SCENE_S_STARS } from './sceneSStars';
import type { SceneBody } from '../../@types/scene/SceneBody';

export const SCENE_BODIES: readonly SceneBody[] = [
  SCENE_EARTH,
  ...SCENE_STARS,
  ...SCENE_PLANETS,
  SGR_A_STAR,
  ...SCENE_S_STARS,
];
