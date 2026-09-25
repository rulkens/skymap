import { describe, it, expect } from 'vitest';
import { blackHoleSlabRow } from '../../../../src/layers/blackHoles/present/blackHoleSlabRow';
import { BLACK_HOLES } from '../../../../src/layers/blackHoles/data/blackHoles';
import { CUBEMAP_CAPTURES } from '../../../../src/data/rendering/cubemapCaptures';

describe('blackHoleSlabRow', () => {
  // The lens pass is gated only by the row's own activity, so the row must
  // fade with the SAME band, measured from the SAME anchor, that the row's
  // OWN `capture` bakes its cubemap from — re-point either one and the lens
  // step runs against a distance nothing captured into.
  it("the Sgr A* slab row shares its capture's band and anchor", () => {
    const [sgrAStar] = BLACK_HOLES;
    if (sgrAStar === undefined) throw new Error('BLACK_HOLES carries no row');
    const row = blackHoleSlabRow(sgrAStar);
    const capture = CUBEMAP_CAPTURES[sgrAStar.capture];

    expect(capture.anchor.anchorId).toBe(row.anchorId);
  });
});
