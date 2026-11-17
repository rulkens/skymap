/**
 * milkyWayFieldCompute — the `mw-field` row: every field pass the planner's
 * plan names, into the `mw-field-*` targets, in EVERY view (dome faces and VR
 * eyes included). Safe with one set of header UBOs because each view is its
 * own submit, the ordering `aerial-perspective` relies on. The passes clear
 * their own targets, which `touched` never sees.
 */
import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { MilkyWayRuntime } from '../../@types/MilkyWayRuntime';
import type { FieldPlannerValue } from '../host/@types/FieldPlannerValue';
import { milkyWayFieldAlpha } from '../present/milkyWayFieldAlpha';
import { deriveFieldView } from '../utils/deriveFieldView';
import { fieldRenderTargetsOf } from '../utils/fieldRenderTargetsOf';
import { spanTimestampWrites } from '../utils/spanTimestampWrites';
import { milkyWayInverseModelCached } from '../../cloud/render/milkyWayInverseModelCached';
import { MILKY_WAY_FIELD_COMPUTE_NAME } from '../data/milkyWayFieldComputeName';

export function milkyWayFieldCompute(
  runtime: MilkyWayRuntime,
  planner: FrameContentPlanner<FieldPlannerValue>,
): ContentCompute<'milkyWayDisk'> {
  return {
    name: MILKY_WAY_FIELD_COMPUTE_NAME,
    scope: 'perView',
    fade: 'milkyWayDisk',
    encode(encoder, ctx, state, claim, fade) {
      const alpha = milkyWayFieldAlpha(runtime, planner, state, ctx, fade);
      if (alpha === null) return;
      // Non-null: the gate above declines a null value.
      const { host, plan } = ctx.snapshot.plans.get(planner, ctx)!;
      host.encode(
        encoder,
        plan,
        deriveFieldView(ctx, milkyWayInverseModelCached()),
        state.settings.milkyWay.field.exposure * alpha,
        fieldRenderTargetsOf(ctx.snapshot.renderTargets),
        spanTimestampWrites(claim, plan),
      );
    },
  };
}
