import { describe, expect, it } from 'vitest';

import { surfacePatchPostIndex } from '../../../src/utils/scene/surfacePatchPostIndex';

/**
 * Hand-computed pairs, not a re-derivation: the row flip (the template's `j`
 * counts NORTH from the anchor's south edge, a height tile's row 0 is its
 * NORTH row) is the one error here no screenshot names — it mirrors the whole
 * patch's relief about its own centre line.
 */
describe('surfacePatchPostIndex', () => {
  it('reads the south-west template corner from the tile’s LAST row', () => {
    expect(surfacePatchPostIndex(0, 0, 64)).toEqual([0, 128]);
  });

  it('reads the north-east template corner from the tile’s FIRST row', () => {
    expect(surfacePatchPostIndex(64, 64, 64)).toEqual([128, 0]);
  });

  it('steps two posts per template cell at n = 64', () => {
    expect(surfacePatchPostIndex(1, 1, 64)).toEqual([2, 126]);
  });

  it('steps sixteen posts per template cell at n = 8', () => {
    expect(surfacePatchPostIndex(1, 0, 8)).toEqual([16, 128]);
  });
});
