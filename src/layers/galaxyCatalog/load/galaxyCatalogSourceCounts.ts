/**
 * galaxyCatalogSourceCounts — the Layer's `sourceCounts` feed: ONE iterable over
 * every point and octree slot, not one per source, so core runs a single saga for
 * the whole Layer. A tier swap re-commits a slot and re-yields, which lets the
 * per-catalog count chip follow the new tier's population. Every report reads the
 * source's live record, so a released slot reports 0 unless the source's other
 * slot holds it (a format switch releases one and commits the other, either order).
 * A record lookup settling re-reports its source's count: that pulse is what a
 * deferred focus retries on.
 */

import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

import { callbackIterable } from '../../../utils/async/callbackIterable';

export function galaxyCatalogSourceCounts(
  runtime: GalaxyCatalogRuntime,
): AsyncIterable<SourceCountReport> {
  return callbackIterable<SourceCountReport>((emit) => {
    const countOf = (source: GalaxyCatalogSourceType): number =>
      runtime.records.get(source)?.recordCount ?? 0;
    const slots = [...runtime.points, ...runtime.octreePoints];
    const unsubscribes = slots.map(([source, slot]) =>
      slot.subscribe((state) => {
        if (state.kind === 'ready' || state.kind === 'idle') {
          emit({ source, count: countOf(source) });
        }
      }),
    );
    unsubscribes.push(
      runtime.recordBridge.onSettle((source) => emit({ source, count: countOf(source) })),
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  });
}
