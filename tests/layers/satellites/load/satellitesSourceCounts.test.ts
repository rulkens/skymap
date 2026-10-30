/**
 * satellitesSourceCounts — the catalog landing must be reported: it is the pulse the selection
 * reconciler re-resolves on, so without it a satellite linked before the catalog loaded never
 * gets its row.
 */

import { describe, it, expect } from 'vitest';

import { satellitesSourceCounts } from '../../../../src/layers/satellites/load/satellitesSourceCounts';
import { Source } from '../../../../src/data/source';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { SatelliteCatalog } from '../../../../src/@types/satellites/SatelliteCatalog';

describe('satellitesSourceCounts', () => {
  it('reports the catalog size each time the catalog lands', async () => {
    const listeners = new Set<() => void>();
    let catalog: SatelliteCatalog | null = null;
    const runtime = {
      slot: {
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      propagator: { catalog: () => catalog },
    } as unknown as SatellitesRuntime;

    const feed = satellitesSourceCounts(runtime)[Symbol.asyncIterator]();
    const first = feed.next();
    for (const l of listeners) l(); // loading: no catalog yet, nothing to report
    catalog = { noradId: new Uint32Array(3) } as unknown as SatelliteCatalog;
    for (const l of listeners) l();
    expect((await first).value).toEqual({ source: Source.Satellite, count: 3 });
    await feed.return?.();
  });
});
