import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * slotReady — true once a slot has a committed value.
 *
 * The single reading of "loaded = the slot has a committed value". Reads
 * `committed()`, not the live `state()`: a slot reloading in place still has
 * its previous commit, so it stays ready through the fetch — the old
 * per-layer `loaded` status mirrors (the deleted flow/filament stores) never
 * flashed "unready" on a reload either, and this is their replacement.
 *
 * The `null` arm absorbs the pre-`wireSlots` window: every `assetSlots` field is
 * `| null` until the GPU-init IIFE mints the slot, and consumers (passes, encode
 * steps) may read before then.
 */
export function slotReady<T, Req>(slot: AssetSlot<T, Req> | null): boolean {
  return slot != null && slot.committed() !== null;
}
