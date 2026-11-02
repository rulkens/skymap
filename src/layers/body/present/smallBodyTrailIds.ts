/**
 * SMALL_BODY_TRAIL_IDS — the small bodies' orbit trails draw only while the body is selected or
 * focused, as a satellite's ring does: three more always-on ellipses crowd the inner system.
 */

import { BODY_BODY_ROWS } from '../bodies/bodyBodyRows';
import { isPlanetBody } from '../../../utils/scene/isPlanetBody';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

export const SMALL_BODY_TRAIL_IDS: readonly SceneBodyId[] = BODY_BODY_ROWS.map((row) => row.body)
  .filter(isPlanetBody)
  .filter((body) => body.captionKind === 'smallBody')
  .map((body) => body.id);
