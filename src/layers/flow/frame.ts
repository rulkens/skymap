/**
 * flowPlanner — the flow Layer's once-per-frame CPU planning row: reconciles
 * the flow renderer's mode and particle count against the live settings and
 * arms a reseed when either changed (mirroring `milkyWayCloud.reconcile`),
 * then votes `awake` while the field animates: its handed value above 0 and the
 * cube committed, the same gate `flowCompute` integrates on. Once-scope because
 * nothing here reads a per-view value.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FlowRuntime } from './@types/FlowRuntime';
import { slotReady } from '../../services/loading/slotReady';

export function flowPlanner(
  runtime: FlowRuntime,
): Extract<FrameContentPlanner<void, 'flow'>, { scope: 'once' }> {
  return {
    name: 'flow',
    scope: 'once',
    fade: 'flow',
    plan: (_snapshot, _views, state, fade) => {
      runtime.renderer.reconcile(state.settings.flow);
      return {
        value: undefined,
        awake: fade > 0 && slotReady(runtime.slot),
        // Never settling, though the ribbons advect forever: flow draws in no
        // capture roster, so nothing it does can stale a sky bake.
        settling: false,
      };
    },
  };
}
