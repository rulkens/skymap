/**
 * cosmicWebDensityPass — the reduced-res density raymarch into the retained
 * `cosmic-web-density` offscreen, which `cosmicWebDensityUpsamplePass`
 * composites into HDR. Both gate on `deriveCosmicWebDensityLiveness`; the march
 * also gates on the accumulation plan's `draw`, so at the cap it stops while the
 * upsample keeps compositing the converged mean.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';
import type { VolumeAccumulationPlan } from '../../@types/VolumeAccumulationPlan';
import { createScalarVolumePass } from '../../../../services/engine/frame/passes/createScalarVolumePass';
import { deriveCosmicWebDensityLiveness } from '../present/deriveCosmicWebDensityLiveness';

export function cosmicWebDensityPass(
  runtime: CosmicWebDensityRuntime,
  planner: FrameContentPlanner<VolumeAccumulationPlan>,
): ContentPass<'cosmicWebDensity'> {
  return createScalarVolumePass<CosmicWebDensityFieldId, 'cosmicWebDensity'>({
    name: 'cosmic-web-density',
    targetId: 'cosmic-web-density',
    fade: 'cosmicWebDensity',
    renderer: runtime.renderer,
    liveness: (state, ctx, fade) =>
      ctx.snapshot.plans.get(planner, ctx).draw
        ? deriveCosmicWebDensityLiveness(runtime, state, ctx, fade)
        : null,
    inputs: (_state, ctx) => ctx.snapshot.plans.get(planner, ctx).inputs,
  });
}
