/**
 * filamentSlot — factory for the cosmic-web skeleton's asset slot.
 *
 * The cosmic-web skeleton flows through its own slot — different fetcher
 * (binary format is segments-not-points), different renderer target
 * (`filamentRenderer` rather than the per-source `galaxyPointRenderer`), and a
 * one-shot lifecycle: load() at boot, never on tier change.
 *
 * Why one-shot?  Re-downloading the ~30 MB skeleton every tier flip
 * would tax bandwidth for a topology that barely differs between tiers
 * — see `filamentFetcher.ts`'s docblock for the detailed rationale,
 * including the "small-tier-on-desktop edge case" trade-off.
 *
 * Construction-pure: builds + subscribes + RETURNS the slot. The
 * orchestrator (`installSlots`) owns the write to `state.assetSlots`.
 */

import { createAssetSlot } from '../AssetSlot';
import { filamentFetcher } from '../fetchers/filamentFetcher';
import { syncVisibilityFades } from '../../engine/wiring/syncVisibilityFades';
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
      // galaxyCatalogSourceRegistry slot, whose upload is async.
      state.gpu.filamentRenderer.upload(cloud);
      // Drive the first-load fade through the intent → fade bridge: the
      // filaments row owns the intent gate (reads settings.filaments.enabled), so
      // a load that completes while the user has filaments off snaps to opacity 0
      // and never renders the cosmic web until they toggle it on.
      syncVisibilityFades(state, { animate: true, only: ['filaments'] });
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
