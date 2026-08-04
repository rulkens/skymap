/**
 * positionedVisibleStars — the seeded stars this frame's star layers draw, each
 * paired with the position the body snapshot resolves for it.
 *
 * `visibleStars` answers WHICH stars (the two registry gates) and
 * `sceneBodyStates` answers WHERE (one map, one instant, shared by every pass).
 * Joining them once here is what lets `partitionStarsByResolution` and the
 * renderer keep reading `star.positionMpc` — the alternative was threading the
 * snapshot through those signatures and their six call sites.
 *
 * The lookup is total by construction: every seeded star is a `SCENE_ANCHORS`
 * root, pinned by the anchor-totality test. A `?? origin` fallback would turn a
 * missing anchor into a star silently drawn at the Sun.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { PositionedStar } from '../../../@types/scene/PositionedStar';
import { sceneBodyStates } from './sceneBodyStates';
import { visibleStars } from './visibleStars';

export function positionedVisibleStars(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly PositionedStar[] {
  const states = sceneBodyStates(state, ctx);
  return visibleStars(state).map((star) => ({
    ...star,
    positionMpc: states.get(star.id)!.positionMpc,
  }));
}
