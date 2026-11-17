/**
 * create — the band renderer and its additive upsample.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { ZoneOfAvoidanceRuntime } from './@types/ZoneOfAvoidanceRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createZoneOfAvoidanceRenderer } from './shell/render/zoneOfAvoidanceRenderer';
import { ZONE_OF_AVOIDANCE_ENTRY } from './sources/zone-of-avoidance';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';

export function create(deps: LayerCoreDeps): ZoneOfAvoidanceRuntime {
  const pickCode = deps.pickCode(ZONE_OF_AVOIDANCE_ENTRY.id);
  return {
    renderer: createZoneOfAvoidanceRenderer(deps.ctx.device, HDR_TARGET_FORMAT, pickCode),
    upsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
    pickCode,
  };
}
