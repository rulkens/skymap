/**
 * sfMapRingIndexForRadius inverts sfMapRingRadius's ring -> radius mapping.
 * The one thing that can silently break here is the round-trip: CPU
 * placement (dustParticleCloud.ts) and the GPU debug view (sfMapPresent.wesl)
 * both derive a ring index from a radius this way, and if the round trip
 * drifted by even one ring, the two would silently normalise against
 * different means.
 */
import { describe, it, expect } from 'vitest';

import { sfMapRingIndexForRadius } from '../../../src/utils/galaxy/sfMapRingIndexForRadius';
import { sfMapRingRadius } from '../../../src/utils/galaxy/sfMapRingRadius';

describe('sfMapRingIndexForRadius', () => {
  it('round-trips every ring index through sfMapRingRadius exactly', () => {
    const rings = 512;
    const rMin = 0.7;
    const rMax = 42;
    for (let ring = 0; ring < rings; ring++) {
      const radius = sfMapRingRadius(ring, rings, rMin, rMax);
      expect(sfMapRingIndexForRadius(radius, rings, rMin, rMax)).toBe(ring);
    }
  });

  it('clamps a radius outside [rMin, rMax] to the nearest edge ring', () => {
    const rings = 16;
    const rMin = 1;
    const rMax = 10;
    expect(sfMapRingIndexForRadius(0.1, rings, rMin, rMax)).toBe(0);
    expect(sfMapRingIndexForRadius(1000, rings, rMin, rMax)).toBe(rings - 1);
  });

  it('degenerates to ring 0 for a single-ring grid, never NaN', () => {
    expect(sfMapRingIndexForRadius(5, 1, 1, 10)).toBe(0);
  });
});
