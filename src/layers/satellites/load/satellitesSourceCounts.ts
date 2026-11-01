/**
 * satellitesSourceCounts — the Layer's `sourceCounts` feed: one report per catalog that lands. Core
 * re-resolves pending selections on that pulse, which is how a satellite linked before its
 * catalog loaded (a deep link, `satellitesAssetRows`'s selection arm) gets its row.
 */

import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';

import { callbackIterable } from '../../../utils/async/callbackIterable';
import { Source } from '../../../data/source';

export function satellitesSourceCounts(
  runtime: SatellitesRuntime,
): AsyncIterable<SourceCountReport> {
  return callbackIterable<SourceCountReport>((emit) => {
    let reported: SatelliteCatalog | null = null;
    return runtime.slot.subscribe(() => {
      const catalog = runtime.propagator.catalog();
      if (catalog === null || catalog === reported) return;
      reported = catalog;
      emit({ source: Source.Satellite, count: catalog.noradId.length });
    });
  });
}
