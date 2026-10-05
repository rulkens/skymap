/**
 * cosmicWebDensityPass — the reduced-res density raymarch into the
 * `cosmic-web-density` offscreen, which `cosmicWebDensityUpsamplePass`
 * composites into HDR. Both gate on `deriveCosmicWebDensityLiveness`.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';
import { createScalarVolumePass } from '../../../services/engine/frame/passes/createScalarVolumePass';
import { deriveCosmicWebDensityLiveness } from '../present/deriveCosmicWebDensityLiveness';

export function cosmicWebDensityPass(runtime: CosmicWebDensityRuntime): ContentPass {
  return createScalarVolumePass({
    name: 'cosmic-web-density',
    targetId: 'cosmic-web-density',
    renderer: runtime.renderer,
    liveness: (state, ctx) => deriveCosmicWebDensityLiveness(runtime, state, ctx),
  });
}
