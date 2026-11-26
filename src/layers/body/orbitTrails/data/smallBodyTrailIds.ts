/**
 * SMALL_BODY_TRAIL_IDS — the small bodies' orbit trails draw only while the body is selected or
 * focused, as a satellite's ring does: three more always-on ellipses crowd the inner system.
 * Element orbits only: a sampled small body draws a sampled trail instead.
 */

import { BODY_BODY_ROWS } from '../../bodies/bodyBodyRows';
import { isPlanetBody } from '../../../../utils/scene/isPlanetBody';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

export const SMALL_BODY_TRAIL_IDS: readonly SceneBodyId[] = BODY_BODY_ROWS.flatMap(
  ({ body, position }) =>
    position.kind === 'orbit' && isPlanetBody(body) && body.captionKind === 'smallBody'
      ? [body.id]
      : [],
);
