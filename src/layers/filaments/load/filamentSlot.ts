/**
 * filamentSlot — factory for the cosmic-web skeleton's asset slot: its own fetcher
 * (the binary format is segments, not points) and its own renderer target.
 * Construction-pure — builds, subscribes and returns. A Layer's slot lands in
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
  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      // upload() is synchronous (returns void); no await needed today. Kept
      // inside the async commit body for symmetry with the galaxy-catalog point
      // slot, whose upload is async.
      renderer.upload(cloud);
    },
  });
  slot.subscribe((s) => {
    // Loading-bar plumbing is owned by aggregateRegistry; this subscriber just
    // logs the parsed counts on the `ready` transition as a dev diagnostic. The
    // render wake is installSlotReadyWake's job, not the factory's.
    if (s.kind === 'ready') {
      console.log(`[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`);
    }
  });
  return slot;
}
