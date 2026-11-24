/** create — the Layer's own glint renderer instance and the sink its mesh slot commits to. */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { EarthScenesRuntime } from './@types/EarthScenesRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createBodyGlintRenderer } from '../../services/gpu/renderers/bodies/bodyGlintRenderer';

export function create(deps: LayerCoreDeps): EarthScenesRuntime {
  return {
    glintRenderer: createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    meshBodies: deps.meshBodies,
  };
}
