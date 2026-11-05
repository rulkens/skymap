import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * slotReady — true once a slot has a committed value. Reads `committed()`, not
 * `state()`, so a reload over a previous commit stays ready; only `release()` clears it.
 * `null` is an optional Layer slot not minted yet.
 */
export function slotReady<T, Req>(slot: AssetSlot<T, Req> | null): boolean {
  return slot != null && slot.committed() !== null;
}
