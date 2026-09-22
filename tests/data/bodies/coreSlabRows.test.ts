import { describe, it, expect } from 'vitest';
import { CORE_SLAB_ROWS } from '../../../src/data/bodies/coreSlabRows';
import { CUBEMAP_CAPTURES } from '../../../src/data/rendering/cubemapCaptures';

describe('CORE_SLAB_ROWS', () => {
  // The lens pass is gated only by the row's own activity, so the row must
  // fade with the SAME band, measured from the SAME anchor, that the
  // `sgrAStar` capture bakes its cubemap from — re-point either one and the
  // lens step runs against a distance nothing captured into.
  it("the Sgr A* slab row shares the sgrAStar capture's band and anchor", () => {
    const coreRow = CORE_SLAB_ROWS.find((row) => row.source === 'lens');
    const capture = CUBEMAP_CAPTURES.sgrAStar;
    if (coreRow === undefined) throw new Error('CORE_SLAB_ROWS carries no lens row');

    expect(capture.band).toBe(coreRow.activeBand);
    expect(capture.anchor.anchorId).toBe(coreRow.anchorId);
  });
});
