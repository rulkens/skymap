/**
 * galaxyMeanAbsMag — pins the per-catalog surface-brightness zero-point.
 *
 * Coverage focus: the arithmetic-mean-of-absolute-magnitude computation
 * itself (easy to get wrong via a sum/count off-by-one or a wrong
 * distance formula), and the empty-catalog fallback other consumers rely
 * on (`galaxySbAmp` callers, `emptyGalaxyCatalog`).
 */

import { describe, it, expect } from 'vitest';
import { galaxyMeanAbsMag } from '../../../src/utils/galaxy/galaxyMeanAbsMag';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

describe('galaxyMeanAbsMag', () => {
  it('returns the arithmetic mean of absoluteFromApparent over every row', () => {
    // Distances chosen so hypot(x,0,0) = x — trivial distance-from-origin.
    const cloud = {
      count: 3,
      magG: new Float32Array([18, 15, 20]),
      positions: new Float32Array([10, 0, 0, 50, 0, 0, 100, 0, 0]),
    } as unknown as GalaxyCatalog;

    const expectedMean =
      (absoluteFromApparent(18, 10) +
        absoluteFromApparent(15, 50) +
        absoluteFromApparent(20, 100)) /
      3;

    expect(galaxyMeanAbsMag(cloud)).toBeCloseTo(expectedMean, 6);
  });

  it('returns -20.5 for an empty catalog', () => {
    const cloud = {
      count: 0,
      magG: new Float32Array(0),
      positions: new Float32Array(0),
    } as unknown as GalaxyCatalog;

    expect(galaxyMeanAbsMag(cloud)).toBe(-20.5);
  });
});
