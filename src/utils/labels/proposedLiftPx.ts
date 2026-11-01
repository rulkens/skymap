/**
 * proposedLiftPx — how far up the screen a lifted caption's text sits off its
 * subject, before the ink-clearance correction (`liftedLabelPlacement` step 1).
 * Shared with the NEAR0 separation cull, which must judge a caption where its
 * text is drawn: a rover under the sub-camera point projects onto its planet's
 * anchor while the planet's name floats a diameter and a half above.
 */

import {
  LEADER_LIFT_FACTOR,
  MIN_LABEL_CLEARANCE_PX,
} from '../../services/engine/presentation/leaderLineStyle';

export function proposedLiftPx(subjectSizePx: number): number {
  return Math.max(MIN_LABEL_CLEARANCE_PX, LEADER_LIFT_FACTOR * subjectSizePx);
}
