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
 * Construction-pure: builds + subscribes + RETURNS the slot. The
 * orchestrator (`installSlots`) owns the write to `state.assetSlots`.
 */

import { createAssetSlot } from '../AssetSlot';
import { filamentFetcher } from '../fetchers/filamentFetcher';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/FilamentCloud';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFilamentSlot: SlotFactory<FilamentCloud, FilamentReq> = (state, cb) => {
  // Register the filament fade handle at opacity 0; the commit's
  // fadeTo(1, FADE_IN_DURATION_MS) ramps it in once the upload lands.
  // Filament is one-shot — never reloaded on tier change — so no
  // fade-out branch is needed.
  state.subsystems.fades.register({ kind: 'filaments' }, 0);

  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      // upload() is synchronous (returns void); no await needed today.
      // Kept inside the async commit body for symmetry with the
      // galaxyCatalogSourceRegistry slot, whose upload is async.
      state.gpu.filamentRenderer.upload(cloud);
      // Only fade in if the user setting requests filaments visible.
      // When `DEFAULT_FILAMENTS_ENABLED = false`, an unconditional
      // fadeTo(1) here would race the React-side toggle and visibly
      // render the cosmic web until the user toggled it off — the
      // pass.enabled() gate accepts EITHER the boolean OR a non-zero
      // fade opacity so anything > 0 keeps rendering.  Gating on
      // settings.filaments.enabled at commit time keeps the slot
      // honest: the fade reflects the user's intent at the moment
      // the binary lands.
      if (state.settings.filaments.enabled) {
        void state.subsystems.fades.fadeTo({ kind: 'filaments' }, 1, FADE_IN_DURATION_MS);
      }
    },
  });
  slot.subscribe((s) => {
    // Loading-bar plumbing is owned by aggregateRegistry; this subscriber
    // only fires the app-visible side effects (counts echo + render wake)
    // on the `ready` transition.
    if (s.kind === 'ready') {
      console.log(
        `[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`,
      );
      // Record the durable load status on the filament store (the authoritative
      // home), then push the parsed counts up to the UI layer.  See
      // `EngineCallbacks.filaments.onReady` for the lifecycle rationale —
      // one-shot, fires only when the optional binary actually loaded.
      state.data.filaments.setLoaded(s.value.stripCount, s.value.vertexCount);
      cb.filaments?.onReady?.(s.value.stripCount, s.value.vertexCount);
      state.subsystems.scheduler.requestRender();
    }
  });
  return slot;
};
