/**
 * create — the lens renderer. Boot-eager, deliberately: the deflection LUT
 * build, its 2 KB texture and two pipelines are a one-off cost, unlike the
 * 50 MB `sky-cubemap` target, which is lazy (`allocateWhen`).
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { BlackHolesRuntime } from './@types/BlackHolesRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createSgrAStarLensingRenderer } from './render/sgrAStarLensingRenderer';

export function create(deps: LayerCoreDeps): BlackHolesRuntime {
  return { lensRenderer: createSgrAStarLensingRenderer(deps.ctx.device, HDR_TARGET_FORMAT) };
}
