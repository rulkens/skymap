/**
 * SMALL_BODY_TRAIL_IDS — the small bodies' orbit trails draw only while the body is selected or
 * focused, as a satellite's ring does: three more always-on ellipses crowd the inner system.
 */

import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

export const SMALL_BODY_TRAIL_IDS: readonly SceneBodyId[] = SCENE_PLANETS.filter(
  (body) => body.captionKind === 'smallBody',
).map((body) => body.id);
