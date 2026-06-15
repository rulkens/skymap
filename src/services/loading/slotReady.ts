import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * slotReady — true once a slot has committed its value to its renderer/consumer
 * (LoadState 'ready').
 *
 * The single reading of "loaded = the slot committed". A slot dispatches
 * `'ready'` only AFTER its `commit()` runs (the renderer `upload`), so this is
 * semantically identical to the old per-layer `loaded` status mirrors — the
 * flow/filament stores that cached the same bit are deleted in favour of this.
 *
 * The `null` arm absorbs the pre-`wireSlots` window: every `assetSlots` field is
 * `| null` until the GPU-init IIFE mints the slot, and consumers (passes, encode
 * steps) may read before then.
 */
export function slotReady<T, Req>(slot: AssetSlot<T, Req> | null): boolean {
  return slot != null && slot.state().kind === 'ready';
}
