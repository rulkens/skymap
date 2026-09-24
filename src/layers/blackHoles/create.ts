/**
 * create — the lens renderer and the marker's glint renderer. Boot-eager,
 * deliberately: the deflection LUT build, its 2 KB texture and the pipelines
 * are a one-off cost, unlike the 50 MB `sky-cubemap` target, which is lazy
 * (`allocateWhen`).
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { BlackHolesRuntime } from './@types/BlackHolesRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createSgrAStarLensingRenderer } from './render/sgrAStarLensingRenderer';
import { createBodyGlintRenderer } from '../../services/gpu/renderers/bodies/bodyGlintRenderer';

export function create(deps: LayerCoreDeps): BlackHolesRuntime {
  return {
    lensRenderer: createSgrAStarLensingRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    markerRenderer: createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
  };
}
