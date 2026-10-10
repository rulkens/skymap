/** create — the sphere renderer; the Layer has no asset to wait for. */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { LightTimeRuntime } from './@types/LightTimeRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createLightTimeSpheresRenderer } from './render/lightTimeSpheresRenderer';

export function create(deps: LayerCoreDeps): LightTimeRuntime {
  return { renderer: createLightTimeSpheresRenderer(deps.ctx.device, HDR_TARGET_FORMAT) };
}
