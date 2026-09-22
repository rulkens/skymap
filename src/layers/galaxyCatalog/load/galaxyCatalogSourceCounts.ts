/**
 * galaxyCatalogSourceCounts — the Layer's `sourceCounts` feed: ONE iterable over
 * every point slot, not one per source, so core runs a single saga for the whole
 * Layer. A tier swap re-commits a slot and re-yields, which is what lets the
 * per-catalog count chip follow the new tier's population.
 */

import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

import { callbackIterable } from '../../../utils/async/callbackIterable';

export function galaxyCatalogSourceCounts(
  runtime: GalaxyCatalogRuntime,
): AsyncIterable<SourceCountReport> {
  return callbackIterable<SourceCountReport>((emit) => {
    const unsubscribes = [...runtime.points].map(([source, slot]) =>
      slot.subscribe((state) => {
        if (state.kind === 'ready') emit({ source, count: state.value.count });
      }),
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  });
}
