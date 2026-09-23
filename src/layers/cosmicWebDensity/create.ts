/**
 * create — the density family's construction in dependency order: the one
 * renderer holding every cube, its upsample, then one slot per source row
 * committing into the renderer. No fade is driven here; core owns the arrival
 * edge (`installFadeOnArrival`), and each commit's `upload` opens the guard.
 */

import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { CosmicWebDensityFieldId } from '../../@types/data/volume/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';

import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createVolumeFieldRenderer } from '../../services/gpu/renderers/volumeField/volumeFieldRenderer';
import { createAdditiveUpsample } from '../../services/gpu/passes/additiveUpsample';
import { MCPM_ENTRY } from './sources/mcpm';
import { POLYPHORM_2MRS_ENTRY } from './sources/polyphorm-2mrs';
import { MCPM_WORKBENCH_ENTRY } from './sources/mcpm-workbench';
import { createCosmicWebDensitySlot } from './load/createCosmicWebDensitySlot';

export function create(deps: LayerCoreDeps): CosmicWebDensityRuntime {
  const renderer = createVolumeFieldRenderer<CosmicWebDensityFieldId>(
    deps.ctx.device,
    HDR_TARGET_FORMAT,
    deps.fadeBgl,
  );
  return {
    renderer,
    upsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
    slots: {
      mcpm: createCosmicWebDensitySlot(MCPM_ENTRY, renderer),
      'polyphorm-2mrs': createCosmicWebDensitySlot(POLYPHORM_2MRS_ENTRY, renderer),
      'mcpm-workbench': createCosmicWebDensitySlot(MCPM_WORKBENCH_ENTRY, renderer),
    },
  };
}
