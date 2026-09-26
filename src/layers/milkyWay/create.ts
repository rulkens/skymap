/**
 * create — the four handles, in construction order: the pick impostor, the
 * generated cloud, its two-pass renderer, and the aggregate offscreen's
 * upsample.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { MilkyWayRuntime } from './@types/MilkyWayRuntime';

import { SLAB_REVERSED_Z, NEAR0 } from '../../services/engine/frame/slabs';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createMilkyWayPickRenderer } from './render/milkyWayPickRenderer';
import { createMilkyWayCloud } from '../../services/engine/galaxyGenerator/v1/milkyWayCloud';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { createMilkyWayCloudRenderer } from './render/milkyWayCloudRenderer';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';

export function create(deps: LayerCoreDeps): MilkyWayRuntime {
  return {
    pickRenderer: createMilkyWayPickRenderer(deps.ctx, deps.fadeBgl, SLAB_REVERSED_Z[NEAR0]!),
    // `MILKY_WAY_TUNING_DEFAULTS.starCount`, not `deps.store`'s live setting:
    // `milkyWayPlanner` regenerates the cloud on divergence from the live
    // setting, so reading settings here would just add a second path to the
    // same answer.
    cloud: createMilkyWayCloud(deps.ctx.device, MILKY_WAY_TUNING_DEFAULTS.starCount),
    cloudRenderer: createMilkyWayCloudRenderer({
      device: deps.ctx.device,
      targetFormat: HDR_TARGET_FORMAT,
    }),
    aggregateUpsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
  };
}
