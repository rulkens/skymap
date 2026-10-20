import type { AssetSlot } from '../../loading/AssetSlot';

/** The slot each gated fade identity waits on, keyed by `fadeIdentityKey`. Only `committed()`
 * is read: a reload keeps the previous upload drawn, so `state()` is the wrong question. */
export type VisibilityGates = ReadonlyMap<string, Pick<AssetSlot<unknown, unknown>, 'committed'>>;
