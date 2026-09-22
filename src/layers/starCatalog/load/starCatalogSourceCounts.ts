/**
 * starCatalogSourceCounts — the Layer's `sourceCounts` feed. The three seeded
 * catalogs (Sun, S-stars, famous stars) ship no `.bin`, so there is no commit to
 * carry their pulse: they are the feed's FIRST yields, before it delegates to the
 * survey slots. Same order as the counts core used to receive from `create`.
 */

import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';

import { callbackIterable } from '../../../utils/async/callbackIterable';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';

export async function* starCatalogSourceCounts(
  runtime: StarCatalogRuntime,
): AsyncGenerator<SourceCountReport> {
  for (const [source, row] of SEEDED_STAR_CATALOGS_BY_SOURCE) {
    yield { source, count: row.stars.length };
  }
  yield* callbackIterable<SourceCountReport>((emit) => {
    const unsubscribes = [...runtime.catalogs].map(([source, slot]) =>
      slot.subscribe((state) => {
        if (state.kind === 'ready') emit({ source, count: state.value.starCount });
      }),
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  });
}
