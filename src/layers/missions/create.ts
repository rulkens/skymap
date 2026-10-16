/** create — the trail renderer; its tracks arrive through core's `trajectoryRegistry`. */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { MissionsRuntime } from './@types/MissionsRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createMissionTrailRenderer } from './render/missionTrailRenderer';

export function create(deps: LayerCoreDeps): MissionsRuntime {
  return { renderer: createMissionTrailRenderer(deps.ctx.device, HDR_TARGET_FORMAT) };
}
