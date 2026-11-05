/**
 * create — the trail renderer (its tracks arrive through core's `trajectoryRegistry`) and the
 * craft's own glint renderer instance.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { MissionsRuntime } from './@types/MissionsRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createMissionTrailRenderer } from './trails/render/missionTrailRenderer';
import { createBodyGlintRenderer } from '../../services/gpu/renderers/bodies/bodyGlintRenderer';
import { catalogPickCodes } from '../../utils/picking/catalogPickCodes';
import { MISSIONS_SOURCE_ROWS } from './sources/missionsSourceRows';

export function create(deps: LayerCoreDeps): MissionsRuntime {
  return {
    trailRenderer: createMissionTrailRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    glintRenderer: createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    pickCodes: catalogPickCodes(MISSIONS_SOURCE_ROWS, deps.pickCode),
  };
}
