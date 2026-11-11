/**
 * milkyWayFieldAlpha — the ONE gate the `mw-field` compute and the
 * `milky-way-field` composite share, so the composite never adds a target the
 * compute did not write this frame. Compute-written targets are invisible to
 * `touched`, which is why the DebugPanel toggle `executeFrame` honours for the
 * compute has to be read here too. Else the cloud's alpha, which the field's
 * exposure takes on as the tool folds its fade into `analyticExposure`.
 */
import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { MilkyWayRuntime } from '../../@types/MilkyWayRuntime';
import type { FieldPlannerValue } from '../host/@types/FieldPlannerValue';
import { computeTimingSlotName } from '../../../../services/engine/frame/timing/computeTimingSlotName';
import { deriveMilkyWayCloudAlpha } from '../../cloud/present/deriveMilkyWayCloudAlpha';
import { MILKY_WAY_FIELD_COMPUTE_NAME } from '../data/milkyWayFieldComputeName';

export function milkyWayFieldAlpha(
  runtime: MilkyWayRuntime,
  planner: FrameContentPlanner<FieldPlannerValue>,
  state: PassState,
  ctx: FrameView,
  fade: number,
): number | null {
  if (ctx.snapshot.plans.get(planner, ctx) === null) return null;
  const toggle = computeTimingSlotName(MILKY_WAY_FIELD_COMPUTE_NAME, ctx.id);
  if (state.settings.debug.disabledPasses[toggle] === true) return null;
  return deriveMilkyWayCloudAlpha(ctx, fade, runtime.pickCode);
}
