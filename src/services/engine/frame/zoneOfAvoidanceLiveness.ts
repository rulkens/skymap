/**
 * zoneOfAvoidanceLiveness — one derivation of "is the ZoA guide band live this
 * frame, and at what opacity?", shared by producer (`zoneOfAvoidancePass`) and
 * consumer (`zoneOfAvoidanceUpsamplePass`) so their gates can't disagree about
 * which offscreen has live content. `null` rather than 0 for "not live", so a
 * caller can gate on `!== null` without risking `if (opacity)` on a real zero.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { zoneOfAvoidanceLayerOpacity } from '../presentation/zoneOfAvoidanceLayerOpacity';

export function deriveZoneOfAvoidanceLiveness(
  state: PassState,
  ctx: ReadyFrameContext,
): number | null {
  if (state.gpu.zoneOfAvoidanceRenderer === null) return null;

  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const opacity = zoneOfAvoidanceLayerOpacity(
    camDistMpc,
    resolveLayerOpacity(state, ctx, { kind: 'zoneOfAvoidance' }),
  );
  return opacity > 0 ? opacity : null;
}
