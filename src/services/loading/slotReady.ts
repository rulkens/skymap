import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * slotReady — true once a slot has a committed value: reads `committed()`,
 * not the live `state()`, so a slot reloading over a previous commit stays
 * ready for the fetch's duration — only `release()` clears it.
 *
 * The `null` arm absorbs the pre-`wireSlots` window: every `assetSlots` field
 * is `| null` until the GPU-init IIFE mints the slot, and consumers (passes,
 * encode steps) may read before then.
 */
export function slotReady<T, Req>(slot: AssetSlot<T, Req> | null): boolean {
  return slot != null && slot.committed() !== null;
}
