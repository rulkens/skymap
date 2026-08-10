/**
 * ismMapRingIndexForSample floor-buckets a radius against
 * ismMapRingRadius's monotonic output. Unlike ismMapRingIndexForRadius
 * (round-to-nearest, exact only for radii that came FROM ismMapRingRadius),
 * this is a binary search whose `hi` starts unvalidated at `rings - 1` — so
 * it can structurally never return the LAST ring index, even for a radius
 * at or past rMax. That's the real contract sampleGalaxyIsmMap and
 * sampleIsmMapOrientation both rely on; a re-derivation of the log-radial
 * formula itself wouldn't catch a regression here.
 */
import { describe, it, expect } from 'vitest';

import { ismMapRingIndexForSample } from '../../../src/utils/galaxy/ismMapRingIndexForSample';

describe('ismMapRingIndexForSample', () => {
  // rings=4, rMin=1, rMax=8 -> ring radii [1, 2, 4, 8] (log-radial, factor 2 per ring).
  const RINGS = 4;
  const R_MIN = 1;
  const R_MAX = 8;

  it('floors a mid-span radius to the ring below it', () => {
    expect(ismMapRingIndexForSample(1.5, RINGS, R_MIN, R_MAX)).toBe(0);
    expect(ismMapRingIndexForSample(3.9, RINGS, R_MIN, R_MAX)).toBe(1);
  });

  it('includes a boundary radius in the ring it exactly matches', () => {
    expect(ismMapRingIndexForSample(2, RINGS, R_MIN, R_MAX)).toBe(1);
    expect(ismMapRingIndexForSample(4, RINGS, R_MIN, R_MAX)).toBe(2);
  });

  it('clamps below rMin to ring 0', () => {
    expect(ismMapRingIndexForSample(0, RINGS, R_MIN, R_MAX)).toBe(0);
  });

  it('clamps above rMax to rings-2, never the unreachable last index', () => {
    // Binary search's `hi` starts at rings-1 unvalidated, so `lo` can only
    // ever converge to rings-2 — a radius at or past rMax lands there, not
    // on rings-1 the way a naive floor-search mental model would expect.
    expect(ismMapRingIndexForSample(8, RINGS, R_MIN, R_MAX)).toBe(RINGS - 2);
    expect(ismMapRingIndexForSample(100, RINGS, R_MIN, R_MAX)).toBe(RINGS - 2);
  });

  it('degenerates to ring 0 for a single-ring grid, never NaN', () => {
    expect(ismMapRingIndexForSample(5, 1, 1, 10)).toBe(0);
  });
});
