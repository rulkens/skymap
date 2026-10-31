/** create — builds the horizon shell renderer into the Layer's HDR target format. */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { CosmicHorizonRuntime } from './@types/CosmicHorizonRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createHorizonShellRenderer } from './render/horizonShellRenderer';

export function create(deps: LayerCoreDeps): CosmicHorizonRuntime {
  return {
    renderer: createHorizonShellRenderer({
      device: deps.ctx.device,
      targetFormat: HDR_TARGET_FORMAT,
    }),
  };
}
