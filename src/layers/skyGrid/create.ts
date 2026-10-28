import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { SkyGridRuntime } from './@types/SkyGridRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createSkyGridRenderer } from './render/skyGridRenderer';

export function create(deps: LayerCoreDeps): SkyGridRuntime {
  return { renderer: createSkyGridRenderer(deps.ctx.device, HDR_TARGET_FORMAT) };
}
