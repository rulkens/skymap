/**
 * galaxyMedianAbsMag — pins the per-catalog surface-brightness zero-point.
 *
 * Coverage focus: that the zero-point is the MEDIAN order statistic (the
 * mean is a different number for these fixtures, so a regression back to
 * summing would fail here), that a single absurd row cannot move it — the
 * property the whole choice of statistic exists for — and the
 * empty-catalog fallback other consumers rely on (`galaxySbAmp` callers,
 * `emptyGalaxyCatalog`).
 */

import { describe, it, expect } from 'vitest';
import { galaxyMedianAbsMag } from '../../../src/utils/galaxy/galaxyMedianAbsMag';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

describe('galaxyMedianAbsMag', () => {
  it('returns the median of absoluteFromApparent over every row', () => {
    // Distances chosen so hypot(x,0,0) = x — trivial distance-from-origin.
    const cloud = {
      count: 3,
      magG: new Float32Array([18, 15, 20]),
      positions: new Float32Array([10, 0, 0, 50, 0, 0, 100, 0, 0]),
    } as unknown as GalaxyCatalog;

    // Absolute magnitudes are -12, -18.49 and -15; the middle one is the
    // third row's. The arithmetic mean of the same three is -15.16, so this
    // assertion actually discriminates median from mean.
    expect(galaxyMedianAbsMag(cloud)).toBeCloseTo(absoluteFromApparent(20, 100), 6);
  });

  it('is not moved materially by a single absurd magnitude', () => {
    // The regression case: SDSS marks missing photometry with `-9999`, which
    // back-solves to a FINITE absolute magnitude near -10000 and so passes
    // every finiteness guard. Under an arithmetic mean one such row in six
    // drags the zero-point by ~1670 mag; the median must barely notice.
    const clean = {
      count: 5,
      magG: new Float32Array([18, 18.2, 18.4, 18.6, 18.8]),
      positions: new Float32Array([100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0]),
    } as unknown as GalaxyCatalog;

    const poisoned = {
      count: 6,
      magG: new Float32Array([18, 18.2, 18.4, 18.6, 18.8, -9999]),
      positions: new Float32Array([
        100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0, 100, 0, 0,
      ]),
    } as unknown as GalaxyCatalog;

    expect(galaxyMedianAbsMag(poisoned)).toBeCloseTo(galaxyMedianAbsMag(clean), 0);
  });

  it('returns -20.5 for an empty catalog', () => {
    const cloud = {
      count: 0,
      magG: new Float32Array(0),
      positions: new Float32Array(0),
    } as unknown as GalaxyCatalog;

    expect(galaxyMedianAbsMag(cloud)).toBe(-20.5);
  });
});
