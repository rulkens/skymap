/**
 * cosmicWebDensityPrintPass — `cosmicWebDensityPass` for the antique look
 * (`ANTIQUE_ONLY_PASSES`, its twin hidden): the same raymarch into the same
 * row, its step jitter held still. The plate thresholds the row into isobaths
 * (`web.wesl`), and a threshold turns per-frame jitter into flicker at rest.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from '../../@types/CosmicWebDensityRuntime';
import { createScalarVolumePass } from '../../../../services/engine/frame/passes/createScalarVolumePass';
import { deriveCosmicWebDensityLiveness } from '../present/deriveCosmicWebDensityLiveness';

export function cosmicWebDensityPrintPass(
  runtime: CosmicWebDensityRuntime,
): ContentPass<'cosmicWebDensity'> {
  return createScalarVolumePass<CosmicWebDensityFieldId, 'cosmicWebDensity'>({
    name: 'cosmic-web-density-print',
    targetId: 'cosmic-web-density',
    fade: 'cosmicWebDensity',
    renderer: runtime.renderer,
    steadyJitter: true,
    liveness: (state, ctx, fade) => deriveCosmicWebDensityLiveness(runtime, state, ctx, fade),
  });
}
