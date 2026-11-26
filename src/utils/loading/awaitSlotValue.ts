import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * The slot's committed value once it has one, or null if the slot errors or is released first: a
 * search awaiting a catalog ends instead of hanging, and its listener goes with it.
 */
export function awaitSlotValue<T>(
  slot: Pick<AssetSlot<T, unknown>, 'current' | 'state' | 'subscribe'>,
): Promise<T | null> {
  return new Promise((resolve) => {
    const now = slot.current();
    if (now !== null) return resolve(now);
    if (slot.state().kind === 'error') return resolve(null);
    const unsubscribe = slot.subscribe((state) => {
      const value = slot.current();
      if (value === null && state.kind !== 'error' && state.kind !== 'idle') return;
      unsubscribe();
      resolve(value);
    });
  });
}
