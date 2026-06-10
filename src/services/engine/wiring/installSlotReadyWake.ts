/**
 * installSlotReadyWake — subscribe every asset slot to wake the render
 * scheduler on `ready`.
 *
 * ### The channel-mouth principle
 *
 * The alternative — each slot's commit path calling
 * `scheduler.requestRender()` itself — scatters the obligation across every
 * slot factory, and any new slot added without knowing the convention is a
 * silent missed-wake. One subscription here absorbs it for all slots, and
 * keeps the loading layer (`AssetSlot`, slot factories) engine-agnostic.
 *
 * It lives at `allSlots` because that Map IS the complete enumeration
 * (points + sidecars + DEV synthetics, built by `installLoadProgress`):
 * "if it shows in the loading bar, it wakes the renderer" — one invariant,
 * one enforcement site.
 *
 * This is sufficient because `AssetSlot` dispatches `ready` only after its
 * commit body resolves, so any GPU upload is complete before the wake fires.
 * `slot.cancel()` re-notifies subscribers with the last ready state, firing
 * an extra wake — harmless, the scheduler coalesces redundant wakes.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';

export function installSlotReadyWake(
  requestRender: () => void,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void {
  for (const [, slot] of allSlots) {
    slot.subscribe((s) => {
      if (s.kind === 'ready') requestRender();
    });
  }
}
