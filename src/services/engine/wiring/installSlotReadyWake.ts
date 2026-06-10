/**
 * installSlotReadyWake — subscribe every asset slot to wake the render
 * scheduler on `ready`.
 *
 * ### The channel-mouth principle
 *
 * Without this module, each slot's commit path must independently call
 * `scheduler.requestRender()` — an obligation scattered across every slot
 * factory and registry. Any new slot added without knowing the convention
 * causes a silent missed-wake. One subscription here absorbs the obligation
 * for all slots at once.
 *
 * The loading layer (`AssetSlot`, individual slot factories) stays
 * engine-agnostic: it knows nothing about schedulers or renderers. The
 * obligation belongs at the channel mouth — the single enumeration where
 * every slot is visible.
 *
 * ### Why here rather than inside `createAssetSlot`
 *
 * `createAssetSlot` is the loading layer's factory. It deliberately has no
 * dependency on the engine; it works in isolation in tests without a GPU
 * device or scheduler in sight. Injecting a `requestRender` callback into
 * `createAssetSlot` would couple the loading layer to the engine, reversing
 * that separation.
 *
 * `allSlots` is the right home because it IS the complete enumeration —
 * every slot that shows in the loading bar is in this Map, built by
 * `installLoadProgress` from points + sidecars + DEV synthetics. "If it
 * shows in the loading bar, it wakes the renderer" is a single invariant
 * with a single enforcement site.
 *
 * ### Ready-after-commit makes this sufficient
 *
 * `AssetSlot` dispatches `ready` only AFTER its commit body finishes: the
 * `dispatch({ kind: 'committed', ... })` call (AssetSlot.ts lines 213–216)
 * runs outside the `try/finally` commit block, after `resolveMine()` has
 * already released the next queued commit. Subscribers receive the `ready`
 * state in the same synchronous tick as that dispatch. The GPU upload
 * (if any) is therefore complete before the wake fires, so the frame the
 * scheduler queues will see fresh vertex data.
 *
 * ### cancel() rollback is harmless
 *
 * `slot.cancel()` can roll back to a previous `ready` state and
 * re-notify all subscribers with it (AssetSlot.ts lines 244–249). This
 * subscription will call `requestRender()` again on that re-notification.
 * The scheduler coalesces redundant wakes into a single queued frame, so
 * the extra call costs nothing.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';

export function installSlotReadyWake(
  state: EngineState,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void {
  for (const [, slot] of allSlots) {
    slot.subscribe((s) => {
      if (s.kind === 'ready') state.subsystems.scheduler.requestRender();
    });
  }
}
