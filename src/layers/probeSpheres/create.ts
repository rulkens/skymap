/** create — the Layer's own glint renderer instance; the mesh renderer and slots are core's. */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { ProbeSpheresRuntime } from './@types/ProbeSpheresRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createBodyGlintRenderer } from '../../services/gpu/renderers/bodies/bodyGlintRenderer';

export function create(deps: LayerCoreDeps): ProbeSpheresRuntime {
  return { glintRenderer: createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT) };
}
