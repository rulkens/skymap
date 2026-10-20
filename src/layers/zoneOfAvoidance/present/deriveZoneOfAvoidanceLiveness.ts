/**
 * deriveZoneOfAvoidanceLiveness — one derivation of "is the ZoA guide band live this
 * frame, and at what opacity?", shared by producer (`zoneOfAvoidancePass`) and
 * consumer (`zoneOfAvoidanceUpsamplePass`) so their gates can't disagree about
 * which offscreen has live content; the lettering hands its label value instead.
 * The band fades in as the Milky Way frames up and back out once the Local Group
 * is the subject. `null` rather than 0 for "not live", so a caller can gate on
 * `!== null` without risking `if (opacity)` on a real zero.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { fadeWindow } from '../../../utils/math/fadeWindow';
import { SCALE_FADE_BANDS } from '../../../data/scaleFadeBands';

export function deriveZoneOfAvoidanceLiveness(
  ctx: Pick<FrameView, 'drawCamPos'>,
  fade: number,
): number | null {
  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const opacity =
    fadeWindow(
      [SCALE_FADE_BANDS.zoneOfAvoidance, SCALE_FADE_BANDS.zoneOfAvoidanceRecede],
      camDistMpc,
    ) * fade;
  return opacity > 0 ? opacity : null;
}
