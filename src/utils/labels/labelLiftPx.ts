/**
 * labelLiftPx — how far up the screen a lifted label's anchor sits off its
 * subject: `LEADER_LIFT_FACTOR` × the subject's apparent diameter, floored at
 * `MIN_LABEL_CLEARANCE_PX`, and raised until the text's ink bottom (`inkDropPx`
 * below the anchor) clears the subject by that much. The anchor-only floor let a
 * top-aligned caption hang its text over the dot. The TS twin of
 * `labels/vertex.wesl::labelLiftPx`.
 */

import {
  LEADER_LIFT_FACTOR,
  MIN_LABEL_CLEARANCE_PX,
} from '../../services/engine/presentation/leaderLineStyle';

export function labelLiftPx(subjectSizePx: number, inkDropPx: number): number {
  return Math.max(
    MIN_LABEL_CLEARANCE_PX,
    LEADER_LIFT_FACTOR * subjectSizePx,
    MIN_LABEL_CLEARANCE_PX + inkDropPx,
  );
}
