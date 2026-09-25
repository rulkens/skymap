/**
 * milkyWayPlanner — the once-per-frame reconcile: regenerate the cloud iff
 * the live `starCount` setting disagrees with the buffers on screen (see
 * `MilkyWayCloud.reconcile`). UNCONDITIONAL — not gated on `enabled` — so
 * re-enabling after a tier change never draws a stale cloud for one frame.
 * The cloud regenerates synchronously and animates nothing on its own, so
 * this planner casts no wake vote.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { MilkyWayRuntime } from './@types/MilkyWayRuntime';

export function milkyWayPlanner(
  runtime: MilkyWayRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  return {
    name: 'milky-way',
    scope: 'once',
    plan: (_snapshot, _views, state) => {
      runtime.cloud.reconcile(state.settings.milkyWay.starCount);
      return {
        value: undefined,
        awake: false,
        settling: false,
      };
    },
  };
}
