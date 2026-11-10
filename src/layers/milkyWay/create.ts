/**
 * create — the five handles, in construction order: the pick impostor, the
 * generated cloud, its two-pass renderer, the additive upsample (shared by
 * the aggregate offscreen and the field targets), and the v2 field's slot,
 * which builds no host until the field part is on.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { MilkyWayRuntime } from './@types/MilkyWayRuntime';

import { SLAB_REVERSED_Z, NEAR0 } from '../../services/engine/frame/slabs';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createMilkyWayPickRenderer } from './picking/render/milkyWayPickRenderer';
import { createMilkyWayCloud } from './cloud/render/milkyWayCloud';
import { MILKY_WAY_CLOUD_TUNING_DEFAULTS } from '../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { createMilkyWayCloudRenderer } from './cloud/render/milkyWayCloudRenderer';
import { MILKY_WAY_ENTRY } from './sources/milky-way';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';
import { createShaderModuleWithDevLog } from '../../services/gpu/shaderCompileLogger';
import { createFieldHostSlot } from './field/host/subsystems/createFieldHostSlot';
import { createGalaxyFieldHost } from './field/host/subsystems/createGalaxyFieldHost';
import { milkyWayFieldHostTuningFor } from './field/host/utils/milkyWayFieldHostTuningFor';
import { DUST_MAP_FORMAT } from './field/host/data/dustMapFormat';

export function create(deps: LayerCoreDeps): MilkyWayRuntime {
  const pickCode = deps.pickCode(MILKY_WAY_ENTRY.id);
  return {
    pickCode,
    pickRenderer: createMilkyWayPickRenderer(
      deps.ctx,
      deps.fadeBgl,
      SLAB_REVERSED_Z[NEAR0]!,
      pickCode,
    ),
    // `MILKY_WAY_CLOUD_TUNING_DEFAULTS.starCount`, not `deps.settings()`'s live setting:
    // `milkyWayPlanner` regenerates the cloud on divergence from the live
    // setting, so reading settings here would just add a second path to the
    // same answer.
    cloud: createMilkyWayCloud(deps.ctx.device, MILKY_WAY_CLOUD_TUNING_DEFAULTS.starCount),
    cloudRenderer: createMilkyWayCloudRenderer({
      device: deps.ctx.device,
      targetFormat: HDR_TARGET_FORMAT,
    }),
    additiveUpsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
    fieldHost: createFieldHostSlot({
      create: () =>
        createGalaxyFieldHost(deps.ctx.device, {
          makeShader: (code, label) => createShaderModuleWithDevLog(deps.ctx.device, code, label),
          hdrFormat: HDR_TARGET_FORMAT,
          dustMapFormat: DUST_MAP_FORMAT,
          // The app renders on demand, and the landing sets `invMeanNorm`.
          onIsmMapLanded: deps.requestRender,
        }).host,
      tuningFor: milkyWayFieldHostTuningFor(),
    }),
  };
}
