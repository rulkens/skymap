/**
 * aggregateRegistry — pure projection of a slot collection into a snapshot
 * suitable for the loading-bar UI and the dev panel.
 *
 * Replaces the existing `loadProgressAggregator`'s ad-hoc per-source byte
 * accounting with a single function called over `slot.state()`.  No
 * subscriber bookkeeping inside the aggregator itself — consumers
 * subscribe to each slot and call this function as needed.
 *
 * "In flight" means `loading` or `committing`.  A `committing` slot still
 * blocks the loading-bar UI from fading out — the user perceives it as
 * "still working" right up to the moment the renderer has the new buffer.
 *
 * Why a function-over-Map (rather than a class with internal state)?  The
 * source-of-truth state already lives in the slots themselves; an aggregator
 * with its own subscriber list would duplicate that storage and risk drift
 * between the slot's view of "loading" and the aggregator's view.  A pure
 * snapshot read each frame is cheap (~10 slots in the registry) and never
 * disagrees with `slot.state()`.
 */
import type { AssetSlot, LoadState } from './types';

export type RegistrySnapshot = {
  slots: Array<{ name: string; state: LoadState<unknown> }>;
  totalLoadedBytes: number;
  totalExpectedBytes: number;
  inFlightCount: number;
};

export function aggregateRegistry(
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): RegistrySnapshot {
  const out: RegistrySnapshot = {
    slots: [],
    totalLoadedBytes: 0,
    totalExpectedBytes: 0,
    inFlightCount: 0,
  };
  for (const [, slot] of slots) {
    const s = slot.state();
    out.slots.push({ name: slot.name, state: s });
    if (s.kind === 'loading') {
      out.totalLoadedBytes += s.loaded;
      out.totalExpectedBytes += s.total;
      out.inFlightCount += 1;
    } else if (s.kind === 'committing') {
      out.inFlightCount += 1;
    }
  }
  return out;
}
