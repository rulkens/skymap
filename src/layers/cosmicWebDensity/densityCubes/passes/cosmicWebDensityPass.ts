/**
 * cosmicWebDensityPass — the reduced-res density raymarch into the
 * `cosmic-web-density` offscreen, which `cosmicWebDensityUpsamplePass`
 * composites into HDR. Both gate on `deriveCosmicWebDensityLiveness`.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';
import { createScalarVolumePass } from '../../../../services/engine/frame/passes/createScalarVolumePass';
import { deriveCosmicWebDensityLiveness } from '../present/deriveCosmicWebDensityLiveness';
import { DENSITY_MARCH_STEPS } from '../data/densityMarchSteps';

export function cosmicWebDensityPass(
  runtime: CosmicWebDensityRuntime,
): ContentPass<'cosmicWebDensity'> {
  return createScalarVolumePass<CosmicWebDensityFieldId, 'cosmicWebDensity'>({
    name: 'cosmic-web-density',
    targetId: 'cosmic-web-density',
    fade: 'cosmicWebDensity',
    renderer: runtime.renderer,
    liveness: (state, ctx, fade) => deriveCosmicWebDensityLiveness(runtime, state, ctx, fade),
    inputs: (state) => ({ jitterIndex: state.frameIndex, steps: DENSITY_MARCH_STEPS, weight: 1 }),
  });
}
