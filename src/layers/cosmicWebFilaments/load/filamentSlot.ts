/**
 * filamentSlot — factory for the cosmic-web skeleton's asset slot: its own fetcher
 * (the binary format is segments, not points) and its own renderer target.
 * Construction-pure — builds and returns. A Layer's slot lands in
 * `state.layerSlots` (`createLayers`), never `state.assetSlots`.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { filamentFetcher } from './filamentFetcher';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import type { FilamentRenderer } from '../../../@types/rendering/FilamentRenderer';

export function createFilamentSlot(
  renderer: FilamentRenderer,
): AssetSlot<FilamentCloud, FilamentReq> {
  return createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      // upload() is synchronous (returns void); no await needed today. Kept
      // inside the async commit body for symmetry with the galaxy-catalog point
      // slot, whose upload is async.
      renderer.upload(cloud);
    },
  });
}
