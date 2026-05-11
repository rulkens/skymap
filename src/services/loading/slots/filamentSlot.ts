/**
 * filamentSlot — factory for the cosmic-web skeleton's asset slot.
 *
 * The cosmic-web skeleton flows through its own slot — different fetcher
 * (binary format is segments-not-points), different renderer target
 * (`filamentRenderer` rather than the per-source `pointRenderer`), and a
 * one-shot lifecycle: load() at boot, never on tier change.
 *
 * Why one-shot?  Re-downloading the ~30 MB skeleton every tier flip
 * would tax bandwidth for a topology that barely differs between tiers
 * — see `filamentFetcher.ts`'s docblock for the detailed rationale,
 * including the "small-tier-on-desktop edge case" trade-off.
 *
 * Pre-H4 (2026-05-11) this mint block lived inline in `wireSlots.ts`.
 * Extracted into its own factory here as part of the slot-factory split.
 */

import { createAssetSlot } from '../AssetSlot';
import { filamentFetcher } from '../fetchers/filamentFetcher';
import type { FilamentReq } from '../fetchers/filamentFetcher';
import type { FilamentCloud } from '../../../@types/FilamentCloud';
import type { SlotFactory } from './types';

export const createFilamentSlot: SlotFactory<FilamentCloud, FilamentReq> = (state, cb) => {
  // Why awaited `upload()` even though `FilamentRenderer.upload` is
  // synchronous?  `await undefined` is harmless and keeps the slot's
  // commit signature uniform with the per-source slots; if a future
  // filament-renderer revision adds an async upload path (e.g. compute-
  // shader rebuild), this site needs no change.
  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      await state.gpu.filamentRenderer.upload(cloud);
    },
  });
  slot.subscribe((s) => {
    // Loading-bar plumbing is owned by aggregateRegistry post-Task-12;
    // this subscriber only fires the app-visible side effects (counts
    // echo + render wake) on the `ready` transition.
    if (s.kind === 'ready') {
      console.log(
        `[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`,
      );
      // Push the parsed counts up to the UI layer.  See
      // `EngineCallbacks.filaments.onReady` for the lifecycle rationale —
      // one-shot, fires only when the optional binary actually loaded.
      cb.filaments?.onReady?.(s.value.stripCount, s.value.vertexCount);
      state.subsystems.scheduler.requestRender();
    }
  });
  state.assetSlots.filaments = slot;
  return slot;
};
