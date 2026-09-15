import { describe, expect, it } from 'vitest';

import { collapseTemplateIndex } from '../../../src/utils/scene/collapseTemplateIndex';

/**
 * Hand-computed, and the `2` case is the one that matters: a band seam's coarse
 * side has no post at the even index either, so snapping there would move the
 * vertex onto nothing and open the very crack the skirt exists to close.
 */
describe('collapseTemplateIndex', () => {
  it('snaps an odd vertex on a collapsed west edge toward the south', () => {
    expect(collapseTemplateIndex(0, 3, 64, [1, 0, 0, 0])).toEqual([0, 2]);
  });

  it('never moves an interior vertex, whatever the edges say', () => {
    expect(collapseTemplateIndex(1, 3, 64, [1, 1, 1, 1])).toEqual([1, 3]);
  });

  it('snaps a vertex on two collapsed edges on both axes', () => {
    expect(collapseTemplateIndex(3, 64, 64, [1, 0, 0, 1])).toEqual([2, 64]);
  });

  it('leaves a band-seam edge alone', () => {
    expect(collapseTemplateIndex(0, 3, 64, [2, 0, 0, 0])).toEqual([0, 3]);
  });
});
