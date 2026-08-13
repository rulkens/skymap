/**
 * zoneOfAvoidanceLiveness — the single derivation of "is the zone-of-avoidance
 * guide band live this frame, and at what opacity?", shared by its
 * producer/consumer chain: `zoneOfAvoidanceLayer` (the ray-marched band into
 * the reduced-res `zoa` offscreen) and `zoneOfAvoidanceUpsampleLayer`
 * (composites that into HDR, then draws the full-res curved lettering). If
 * the two disagreed, the upsample could composite an offscreen the producer
 * skipped clearing this frame — the same stale-offscreen trap
 * `volumeLiveness.ts` closes for volumes and `milkyWayCloudLiveness.ts`
 * closes for the Milky Way cloud.
 *
 * Composes the band's visibility WINDOW (`zoneOfAvoidanceLayerOpacity`: the
 * Milky-Way-scaled approach band × the Local-Group-scaled recede band) with
 * the fade-registry toggle opacity — the exact composition
 * `zoneOfAvoidanceLayer` used to inline directly (pre gate-fix 6). Returns
 * `null` rather than 0 for "not live" so callers can gate on `!== null`
 * without risking `if (opacity)` on a legitimately-zero value.
 *
 * `enabled` does NOT also check `state.gpu.zoneOfAvoidanceRenderer` — same
 * choice `filamentsLayer` / `horizonShellLayer` make: a null-renderer frame
 * (only possible pre-`initGpu`) still reports live, and each layer's `draw`
 * self-corrects into a no-op via its own `=== null` guard.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { zoneOfAvoidanceLayerOpacity } from '../presentation/zoneOfAvoidanceLayerOpacity';

export function deriveZoneOfAvoidanceLiveness(
  state: EngineState,
  ctx: ReadyFrameContext,
): number | null {
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
