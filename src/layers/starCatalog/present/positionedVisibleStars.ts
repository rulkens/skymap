/**
 * positionedVisibleStars — the seeded stars this frame's star layers draw, each
 * paired with the position the body snapshot resolves for it.
 *
 * `visibleStars` answers WHICH stars (the per-source gates) and the frame's one
 * body sample answers WHERE (one map, one instant, shared by every pass and by
 * `starNearSpheres`). Joining them once here is what lets
 * `partitionStarsByResolution` and the renderer keep reading `star.positionMpc`.
 *
 * The lookup is total by construction: every seeded star is a `SCENE_ANCHORS`
 * root, pinned by the anchor-totality test. A `?? origin` fallback would turn a
 * missing anchor into a star silently drawn at the Sun.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { StarCatalogSettings } from '../../../@types/settings/StarCatalogSettings';
import type { PositionedStar } from '../@types/PositionedStar';
import { visibleStars } from './visibleStars';

export function positionedVisibleStars(
  bodyStates: ReadonlyMap<string, BodyState>,
  settings: StarCatalogSettings,
): readonly PositionedStar[] {
  return visibleStars(settings).map((star) => ({
    ...star,
    positionMpc: bodyStates.get(star.id)!.positionMpc,
  }));
}
