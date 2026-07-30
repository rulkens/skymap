/**
 * countEstimatedProvenance tallies each axis off its own fallback-flag
 * column, and stops at the shorter of `cloud.count` and the flag array's
 * length — a synthetic cloud can over-allocate its columns beyond the rows
 * it actually carries, and a partial cloud stub can omit a column entirely.
 */

import { describe, it, expect } from 'vitest';
import { countEstimatedProvenance } from '../../src/utils/countEstimatedProvenance';
import { makeGalaxyCatalog } from '../fixtures/makeGalaxyCatalog';

describe('countEstimatedProvenance', () => {
  it('counts each axis from its own flag column, bounded by cloud.count', () => {
    const cloud = makeGalaxyCatalog(4, {
      orientationIsFallback: Uint8Array.from([1, 0, 1, 0, 1]), // trailing 1 past count=4
      diameterIsFallback: Uint8Array.from([0, 0, 1, 0, 1]),
    });

    expect(countEstimatedProvenance(cloud)).toEqual({
      total: 4,
      estimated: { orientation: 2, size: 1 },
    });
  });

  it('counts zero for an axis whose flag column is absent, but still reports total', () => {
    const cloud = makeGalaxyCatalog(4);
    // Models a partial cloud stub like the ones engine-wiring tests hand the
    // slot: carries `count` but not the flag columns. The cast is narrow —
    // only this one field loses its type — because GalaxyCatalog itself
    // requires the column; the stub is what a caller can actually pass.
    delete (cloud as { orientationIsFallback?: Uint8Array }).orientationIsFallback;

    expect(countEstimatedProvenance(cloud)).toEqual({
      total: 4,
      estimated: { orientation: 0, size: 0 },
    });
  });
});
