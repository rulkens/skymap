/** create — the craft's own glint renderer instance. */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { MissionsRuntime } from './@types/MissionsRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createBodyGlintRenderer } from '../../services/gpu/renderers/bodies/bodyGlintRenderer';
import { CRAFT_ENTRY } from './sources/craft';

export function create(deps: LayerCoreDeps): MissionsRuntime {
  return {
    glintRenderer: createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    pickCode: deps.pickCode(CRAFT_ENTRY.id),
    meshBodies: deps.meshBodies,
  };
}
