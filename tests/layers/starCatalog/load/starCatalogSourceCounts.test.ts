/**
 * starCatalogSourceCounts — the boot-order rule the seeded catalogs live under:
 * core echoes a `ready` status per report, so a seeded count reported before
 * `wireSlots` dispatches `loading` unblocks the splash CTAs for the whole
 * manifest fetch. Nothing may be yielded until one of the Layer's own slots
 * speaks.
 */

import { describe, it, expect } from 'vitest';

import { starCatalogSourceCounts } from '../../../../src/layers/starCatalog/load/starCatalogSourceCounts';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../../src/data/bodies/seededStarCatalogsBySource';
import { Source } from '../../../../src/data/sources';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { SourceCountReport } from '../../../../src/@types/engine/layer/SourceCountReport';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';

/** A slot stub with only the one method the feed reads. */
function fakeSlot<T>() {
  const subscribers = new Set<(state: LoadState<T>) => void>();
  return {
    slot: {
      subscribe(fn: (state: LoadState<T>) => void) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    },
    emit(state: LoadState<T>) {
      for (const fn of subscribers) fn(state);
    },
  };
}

/** Drains everything the feed has buffered, without parking on the next pull. */
async function drain(
  iterator: AsyncIterator<SourceCountReport>,
  count: number,
): Promise<SourceCountReport[]> {
  const seen: SourceCountReport[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = await iterator.next();
    if (result.done === true) break;
    seen.push(result.value);
  }
  return seen;
}

const SEEDED_SOURCES = [...SEEDED_STAR_CATALOGS_BY_SOURCE].map(([source]) => source);

describe('starCatalogSourceCounts', () => {
  it('reports no seeded count until one of the Layer’s slots reports its state', async () => {
    const gaia = fakeSlot<StarCatalog>();
    const famous = fakeSlot<unknown>();
    const runtime = {
      catalogs: new Map([[Source.GaiaStars, gaia.slot]]),
      famousStarsMeta: famous.slot,
    } as unknown as StarCatalogRuntime;

    const iterator = starCatalogSourceCounts(runtime)[Symbol.asyncIterator]();
    const pending = iterator.next();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // The Layer's always-demanded sidecar is the earliest guaranteed speaker.
    famous.emit({ kind: 'loading' } as LoadState<unknown>);

    expect(await pending).toMatchObject({ done: false });
  });

  it('reports the seeded counts before the survey’s own count', async () => {
    const gaia = fakeSlot<StarCatalog>();
    const famous = fakeSlot<unknown>();
    const runtime = {
      catalogs: new Map([[Source.GaiaStars, gaia.slot]]),
      famousStarsMeta: famous.slot,
    } as unknown as StarCatalogRuntime;

    const iterator = starCatalogSourceCounts(runtime)[Symbol.asyncIterator]();
    gaia.emit({ kind: 'ready', value: { starCount: 1234 } } as unknown as LoadState<StarCatalog>);

    const reports = await drain(iterator, SEEDED_SOURCES.length + 1);

    expect(reports.map((r) => r.source)).toEqual([...SEEDED_SOURCES, Source.GaiaStars]);
    expect(reports.at(-1)).toEqual({ source: Source.GaiaStars, count: 1234 });
  });
});
