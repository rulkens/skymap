/**
 * filamentSlot — factory for the cosmic-web skeleton's asset slot.
 *
 * The cosmic-web skeleton flows through its own slot — different fetcher
 * (binary format is segments-not-points) and a different renderer target
 * (`filamentRenderer` rather than the per-source `galaxyPointRenderer`).
 *
 * Construction-pure: builds + subscribes + RETURNS the slot. The
 * orchestrator (`installSlots`) owns the write to `state.assetSlots`.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { filamentFetcher } from './filamentFetcher';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFilamentSlot: SlotFactory<FilamentCloud, FilamentReq> = (state) => {
  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      // upload() is synchronous (returns void); no await needed today.
      // Kept inside the async commit body for symmetry with the
      // galaxy-catalog point slot, whose upload is async.
      state.gpu.filamentRenderer.upload(cloud);
    },
  });
  slot.subscribe((s) => {
    // Loading-bar plumbing is owned by aggregateRegistry; this subscriber
    // just logs the parsed counts on the `ready` transition as a dev
    // diagnostic. The render wake is installSlotReadyWake's job, not the
    // factory's. Load status needs no store mirror either —
    // `slotReady(assetSlots.filaments)` is the authoritative "loaded" bit.
    if (s.kind === 'ready') {
      console.log(`[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`);
    }
  });
  return slot;
};
