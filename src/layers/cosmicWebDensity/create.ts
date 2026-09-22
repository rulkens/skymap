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
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from './sources/cosmicWebDensitySourceRows';
import { createCosmicWebDensitySlot } from './load/createCosmicWebDensitySlot';

export function create(deps: LayerCoreDeps): CosmicWebDensityRuntime {
  const renderer = createVolumeFieldRenderer<CosmicWebDensityFieldId>(
    deps.ctx.device,
    HDR_TARGET_FORMAT,
    deps.fadeBgl,
  );
  // The source rows cover every id, so the fold is the whole Record.
  const slots = Object.fromEntries(
    COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => [
      entry.id,
      createCosmicWebDensitySlot(entry, renderer),
    ]),
  ) as CosmicWebDensityRuntime['slots'];
  return {
    renderer,
    upsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
    slots,
  };
}
