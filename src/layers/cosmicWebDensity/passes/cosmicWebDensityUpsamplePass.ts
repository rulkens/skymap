/**
 * cosmicWebDensityUpsamplePass — composites the reduced-res
 * `cosmic-web-density` offscreen into HDR. Shares the raymarch's liveness gate,
 * so the two cannot disagree about whether the offscreen was written.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';
import { createUpsamplePass } from '../../../services/engine/frame/passes/createUpsamplePass';
import { deriveCosmicWebDensityLiveness } from '../present/deriveCosmicWebDensityLiveness';

export function cosmicWebDensityUpsamplePass(runtime: CosmicWebDensityRuntime): ContentPass {
  return createUpsamplePass({
    name: 'cosmic-web-density-upsample',
    sourceTargetId: 'cosmic-web-density',
    handleOf: () => runtime.upsample,
    enabled: (state, ctx) => deriveCosmicWebDensityLiveness(runtime, state, ctx) !== null,
  });
}
