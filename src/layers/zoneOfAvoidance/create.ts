/**
 * create — the band renderer and its additive upsample.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { ZoneOfAvoidanceRuntime } from './types/ZoneOfAvoidanceRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createZoneOfAvoidanceRenderer } from './render/zoneOfAvoidanceRenderer';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';

export function create(deps: LayerCoreDeps): ZoneOfAvoidanceRuntime {
  return {
    renderer: createZoneOfAvoidanceRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    upsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
  };
}
