/**
 * milkyWayPlanner — the once-per-frame reconcile: regenerate the cloud iff
 * the live `starCount` setting disagrees with the buffers on screen (see
 * `MilkyWayCloud.reconcile`), then sync the v2 field's host and plan its
 * frame. UNCONDITIONAL — not gated on `enabled` — so re-enabling after a tier
 * change never draws a stale cloud for one frame. The value carries the one
 * `plan()` of the frame, so the compute and the composite cannot disagree.
 * No wake vote: the cloud regenerates synchronously, and the field's ISM
 * landing requests its own frame.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { MilkyWayRuntime } from './@types/MilkyWayRuntime';
import type { FieldPlannerValue } from './field/host/@types/FieldPlannerValue';
import { selectMilkyWayParts } from './state/milkyWay/selectors';

export function milkyWayPlanner(
  runtime: MilkyWayRuntime,
): Extract<FrameContentPlanner<FieldPlannerValue>, { scope: 'once' }> {
  return {
    name: 'milky-way',
    scope: 'once',
    plan: (_snapshot, _views, state) => {
      const settings = state.settings.milkyWay;
      runtime.cloud.reconcile(settings.cloud.starCount);
      const host = runtime.fieldHost.sync(selectMilkyWayParts(settings).field, settings.field.dust);
      return {
        value: host === null ? null : { host, plan: host.plan() },
        awake: false,
        settling: false,
        loading: false,
      };
    },
  };
}
