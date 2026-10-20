/**
 * The count feed reports a source whichever of its two slots holds it: the octree slot's
 * commit reports the octree's records (a `pgc-` deep link retries on that pulse), and the
 * flat slot's release after it does not zero the chip.
 */
import { describe, expect, it } from 'vitest';

import type { GalaxyCatalogSourceType } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../../../src/@types/data/galaxyCatalog/GalaxyRecordSource';
import type { SourceCountReport } from '../../../../src/@types/engine/layer/SourceCountReport';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { Source } from '../../../../src/data/sources';
import { galaxyCatalogSourceCounts } from '../../../../src/layers/galaxyCatalog/load/galaxyCatalogSourceCounts';

function fakeSlot() {
  const listeners = new Set<(s: LoadState<unknown>) => void>();
  return {
    subscribe(fn: (s: LoadState<unknown>) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    announce(kind: 'ready' | 'idle') {
      for (const fn of listeners) fn({ kind } as LoadState<unknown>);
    },
  };
}

describe('galaxyCatalogSourceCounts', () => {
  it('reports the octree slot commit, and a later flat release keeps that count', async () => {
    const source = Source.Glade as GalaxyCatalogSourceType;
    const flat = fakeSlot();
    const octree = fakeSlot();
    const records = new Map<GalaxyCatalogSourceType, GalaxyRecordSource>();
    const runtime = {
      points: new Map([[source, flat]]),
      octreePoints: new Map([[source, octree]]),
      records,
      recordBridge: { onSettle: () => () => {} },
    } as unknown as GalaxyCatalogRuntime;
    const feed = galaxyCatalogSourceCounts(runtime)[Symbol.asyncIterator]();

    records.set(source, { recordCount: 42 } as GalaxyRecordSource);
    octree.announce('ready');
    flat.announce('idle');

    const reports: SourceCountReport[] = [(await feed.next()).value, (await feed.next()).value];
    expect(reports).toEqual([
      { source, count: 42 },
      { source, count: 42 },
    ]);
    await feed.return!();
  });
});
