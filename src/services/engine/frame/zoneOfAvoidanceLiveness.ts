/**
 * zoneOfAvoidanceLiveness — single derivation of "is the ZoA guide band live
 * this frame, and at what opacity?", shared by producer
 * (`zoneOfAvoidanceLayer`) and consumer (`zoneOfAvoidanceUpsampleLayer`) so
 * their gates can't disagree about which offscreen has live content this
 * frame — mirrors `volumeLiveness.ts`, including its renderer-null gate.
 *
 * Returns `null` rather than 0 for "not live" so callers can gate on
 * `!== null` without risking `if (opacity)` on a legitimate zero.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { zoneOfAvoidanceLayerOpacity } from '../presentation/zoneOfAvoidanceLayerOpacity';

export function deriveZoneOfAvoidanceLiveness(
  state: EngineState,
  ctx: ReadyFrameContext,
): number | null {
  if (state.gpu.zoneOfAvoidanceRenderer === null) return null;

  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  const opacity = zoneOfAvoidanceLayerOpacity(
    camDistMpc,
    resolveLayerOpacity(
      state.subsystems.fades,
      { kind: 'zoneOfAvoidance' },
      ctx.focusBlend,
      ctx.nowMs,
      state.subsystems.clipPlayer,
    ),
  );
  return opacity > 0 ? opacity : null;
}
