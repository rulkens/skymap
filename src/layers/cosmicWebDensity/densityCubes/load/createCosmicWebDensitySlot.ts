/**
 * createCosmicWebDensitySlot — one density row's asset slot, construction-pure. Its commit waits
 * for the jitter mask, so no frame marches a cube with zero jitter (a visible step grid) while the
 * mask is still on its way.
 */

import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../sources/cosmicWebDensitySourceRows';
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { GpuVolume } from '../../../../@types/rendering/GpuVolume';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';
import type { CosmicWebDensitySlotDeps } from '../../@types/CosmicWebDensitySlotDeps';

export function createCosmicWebDensitySlot(
  entry: (typeof COSMIC_WEB_DENSITY_SOURCE_ROWS)[number],
  { renderer, jitterMaskReady, fetch }: CosmicWebDensitySlotDeps,
): AssetSlot<GpuVolume, CosmicWebDensityReq> {
  const id = entry.id;
  return createAssetSlot<GpuVolume, CosmicWebDensityReq>({
    name: id,
    fetch,
    commit: async (volume) => {
      try {
        await jitterMaskReady;
      } catch (error) {
        // The slot disposes only superseded values, never one whose commit failed.
        volume.texture.destroy();
        throw error;
      }
      renderer.upload(id, volume, entry);
    },
    onRelease: () => renderer.unload(id),
    dispose: (volume) => volume.texture.destroy(),
  });
}
