/**
 * milkyWayFieldPass — the `milky-way-field` composite: the field's reduced-res
 * targets added into HDR right after `milky-way-upsample`, so v1 dust extincts
 * field light as it does the cloud's. One hand-written pass rather than an
 * upsample row per target, because the planner's `plan.composites` varies by
 * frame. Shares the compute's gate, toggle included; no pick.
 */
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { MilkyWayRuntime } from '../../@types/MilkyWayRuntime';
import type { FieldPlannerValue } from '../host/@types/FieldPlannerValue';
import { encodeFieldComposites } from '../host/render/encodeFieldComposites';
import { milkyWayFieldAlpha } from '../present/milkyWayFieldAlpha';
import { fieldRenderTargetsOf } from '../utils/fieldRenderTargetsOf';

export function milkyWayFieldPass(
  runtime: MilkyWayRuntime,
  planner: FrameContentPlanner<FieldPlannerValue>,
): ContentPass<'milkyWayDisk'> {
  return {
    name: 'milky-way-field',
    fade: 'milkyWayDisk',
    enabled: (state, ctx, _view, fade) =>
      milkyWayFieldAlpha(runtime, planner, state, ctx, fade) !== null,
    draw(pass, _view, ctx) {
      // Non-null: `enabled` declines a null value.
      const { plan } = ctx.snapshot.plans.get(planner, ctx)!;
      encodeFieldComposites(
        pass,
        runtime.additiveUpsample,
        plan,
        fieldRenderTargetsOf(ctx.snapshot.renderTargets),
      );
    },
  };
}
