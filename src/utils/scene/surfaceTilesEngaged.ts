import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../@types/engine/frame/SlabView';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../services/engine/frame/foregroundMaxDistance';
import { prepareBodySurfaceFrame } from '../../services/engine/frame/passes/earthPass';

/**
 * surfaceTilesEngaged — the tile planner's gate, body-generic where
 * `earthPass.enabled` is Earth-only: it must never require
 * `state.gpu.earthRenderer`, since a registry body with no base-globe
 * renderer of its own (Mars, later) still tiles. Reuses
 * `prepareBodySurfaceFrame`'s per-`(ctx, bodyId)` memo as the "scene data
 * seeded" check, so this call and the planner's own moments later share one
 * lookup rather than paying for it twice.
 */
export function surfaceTilesEngaged(
  state: PassState,
  ctx: ReadyFrameContext,
  view: SlabView,
): boolean {
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
  return prepareBodySurfaceFrame(state, ctx, view) !== null;
}
