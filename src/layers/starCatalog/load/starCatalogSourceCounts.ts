/**
 * starCatalogSourceCounts — the Layer's `sourceCounts` feed.
 *
 * The three seeded catalogs (Sun, S-stars, famous stars) ship no `.bin`, so
 * nothing lands to carry their pulse. They cannot be the feed's first yields
 * either: core echoes a `ready` status per report, and a report landing before
 * `wireSlots` dispatches `loading` would unblock the splash CTAs for the whole
 * manifest fetch. So they ride the first state event from ANY of this Layer's
 * slots — the survey subscription alone can stay silent for a whole session
 * (Gaia disabled in settings), where the famous-star meta slot is demanded
 * unconditionally, so one of them always speaks.
 */

import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';

import { callbackIterable } from '../../../utils/async/callbackIterable';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';

export function starCatalogSourceCounts(
  runtime: StarCatalogRuntime,
): AsyncIterable<SourceCountReport> {
  return callbackIterable<SourceCountReport>((emit) => {
    let seededReported = false;
    const emitSeeded = (): void => {
      if (seededReported) return;
      seededReported = true;
      for (const [source, row] of SEEDED_STAR_CATALOGS_BY_SOURCE) {
        emit({ source, count: row.stars.length });
      }
    };

    const unsubscribes = [
      runtime.famousStarsMeta.subscribe(emitSeeded),
      ...[...runtime.catalogs].map(([source, slot]) =>
        slot.subscribe((state) => {
          emitSeeded();
          if (state.kind === 'ready') emit({ source, count: state.value.starCount });
        }),
      ),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  });
}
