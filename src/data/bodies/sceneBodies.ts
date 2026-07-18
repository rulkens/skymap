/**
 * SCENE_BODIES — the flat registry every body-aware consumer reads from: the
 * command-palette search rows, the `body-<id>` focus-id resolver, and the
 * selection-row extractor all iterate / look up this one list. Seeding a new
 * body is a one-line push into its seed table (`sceneEarth`, `sceneStars`,
 * `scenePlanets`) — no parallel list to keep in sync. Consumers only touch the
 * fields the `SceneBody` union shares (`id`, `label`, `positionMpc`, `radiusKm`).
 */

import { SCENE_EARTH } from './sceneEarth';
import { SCENE_STARS } from './sceneStars';
import { SCENE_PLANETS } from './scenePlanets';
import type { SceneBody } from '../../@types/scene/SceneBody';

export const SCENE_BODIES: readonly SceneBody[] = [SCENE_EARTH, ...SCENE_STARS, ...SCENE_PLANETS];
