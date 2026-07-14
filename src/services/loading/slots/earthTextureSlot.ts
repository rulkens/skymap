/**
 * earthTextureSlot — factory for the Blue Marble texture's asset slot.
 *
 * **Why a slot, not a fire-and-forget IIFE.**  The texture load used to be an
 * anonymous `void (async () => …)()` at the tail of `initGpu`. Making it a
 * first-class `ASSET_WIRING` row buys three things the IIFE could not:
 *
 *   - *Lifecycle ownership.*  The `AssetSlot` aborts the fetch + decode on
 *     release, so no ~MB download or `createImageBitmap` decode runs past
 *     `destroy()`, and no render wake fires against a torn-down scheduler. The
 *     IIFE's `?.` on `setTexture` was only a half-guard: the fetch and decode
 *     still ran to completion after teardown.
 *   - *A single demand-gated home.*  Load policy lives in one predicate on the
 *     `ASSET_WIRING` row (see that module's header), re-evaluated uniformly with
 *     every other asset, rather than as bootstrap-phase closure state.
 *   - *Testability.*  The commit's swap, the failure branch, and the
 *     null-renderer (destroy-race) branch become units instead of anonymous
 *     closure state inside a phase.
 *
 * **Why descent-gated.**  Every visitor used to pay the ~MB JPG fetch + decode
 * at page load for a texture only distinguishable after a deep-zoom descent
 * (Earth subtends a pixel only around ~1e-13 Mpc). The `ASSET_WIRING` row's
 * `demand` predicate defers the cost to the descent — mirroring the thumbnail
 * pipeline's defer-until-visible posture. The gate is `DESCENT_ONSET_MPC`
 * (`presentation/scaleFadeBands.ts`) — the shared "you've descended into the
 * solar system" threshold, so the texture starts loading at the same moment
 * the solar-system captions appear. The renderer's mid-blue placeholder
 * sphere (its pre-texture state) covers the in-flight window, and the descent
 * from that gate down to the surface spans ~13 decades of zoom — orders of
 * magnitude more lead time than the fetch + decode needs.
 *
 * Construction-pure: builds + subscribes + RETURNS the slot. The orchestrator
 * (`installSlots`) owns the write to `state.assetSlots`; `reevaluateDemand`
 * owns when it loads.
 */

import { createAssetSlot } from '../AssetSlot';
import { earthTextureFetcher } from '../fetchers/earthTextureFetcher';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createEarthTextureSlot: SlotFactory<ImageBitmap, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'earthTexture',
    fetch: earthTextureFetcher,
    commit: async (bitmap) => {
      // Re-skin the already-visible placeholder Earth — nothing else. The
      // `?.` makes the destroy race (handle nulled before the fetch resolves)
      // a no-op instead of a crash, the bug the IIFE's `?.` only half-covered.
      // No manual requestRender: `installSlotReadyWake` wakes the loop on the
      // slot's `ready` transition, which fires after this commit resolves. No
      // `syncVisibilityFades`: the Earth sphere is already on-screen as the
      // placeholder; `setTexture` only re-skins it — it is not a visibility
      // fade.
      state.gpu.earthRenderer?.setTexture(bitmap);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log('[engine] earthTexture: Blue Marble texture loaded');
    }
  });
  return slot;
};
