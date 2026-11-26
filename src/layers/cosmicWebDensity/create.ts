/**
 * create — the density family's construction in dependency order: the jitter
 * mask (its fetch starts here), the one renderer holding every cube, its
 * upsample, then one slot per source row committing into the renderer once
 * the mask is written. No fade is driven here: each asset row's `gates` lets
 * core fade a cube in on its slot's commit.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { CosmicWebDensityFieldId } from './@types/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';
import type { CosmicWebDensitySlotDeps } from './@types/CosmicWebDensitySlotDeps';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createBlueNoiseMask } from '../../services/gpu/resources/createBlueNoiseMask';
import { createVolumeFieldRenderer } from '../../services/gpu/renderers/volumeField/volumeFieldRenderer';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from './sources/cosmicWebDensitySourceRows';
import { createCosmicWebDensitySlot } from './densityCubes/load/createCosmicWebDensitySlot';
import { createCosmicWebDensityFetcher } from './densityCubes/load/createCosmicWebDensityFetcher';

export function create(deps: LayerCoreDeps): CosmicWebDensityRuntime {
  const jitterMask = createBlueNoiseMask(deps.ctx.device);
  const renderer = createVolumeFieldRenderer<CosmicWebDensityFieldId>({
    device: deps.ctx.device,
    targetFormat: HDR_TARGET_FORMAT,
    fadeBgl: deps.fadeBgl,
    jitterMask: jitterMask.texture,
  });
  const slotDeps: CosmicWebDensitySlotDeps = {
    renderer,
    jitterMaskReady: jitterMask.ready,
    fetch: createCosmicWebDensityFetcher(deps.ctx.device),
  };
  return {
    renderer,
    upsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
    jitterMask,
    // `Object.fromEntries` widens keys to `string`; the rows tuple names every field id.
    slots: Object.fromEntries(
      COSMIC_WEB_DENSITY_SOURCE_ROWS.map((entry) => [
        entry.id,
        createCosmicWebDensitySlot(entry, slotDeps),
      ]),
    ) as CosmicWebDensityRuntime['slots'],
  };
}
