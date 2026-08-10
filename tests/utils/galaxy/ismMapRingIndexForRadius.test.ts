/**
 * ismMapRingIndexForRadius inverts ismMapRingRadius's ring -> radius mapping.
 * The one thing that can silently break here is the round-trip: CPU
 * placement (dustParticleCloud.ts) and the GPU debug view (ismMapPresent.wesl)
 * both derive a ring index from a radius this way, and if the round trip
 * drifted by even one ring, the two would silently normalise against
 * different means.
 */
import { describe, it, expect } from 'vitest';

import { ismMapRingIndexForRadius } from '../../../src/utils/galaxy/ismMapRingIndexForRadius';
import { ismMapRingRadius } from '../../../src/utils/galaxy/ismMapRingRadius';

describe('ismMapRingIndexForRadius', () => {
  it('round-trips every ring index through ismMapRingRadius exactly', () => {
    const rings = 512;
    const rMin = 0.7;
    const rMax = 42;
    for (let ring = 0; ring < rings; ring++) {
      const radius = ismMapRingRadius(ring, rings, rMin, rMax);
      expect(ismMapRingIndexForRadius(radius, rings, rMin, rMax)).toBe(ring);
    }
  });

  it('clamps a radius outside [rMin, rMax] to the nearest edge ring', () => {
    const rings = 16;
    const rMin = 1;
    const rMax = 10;
    expect(ismMapRingIndexForRadius(0.1, rings, rMin, rMax)).toBe(0);
    expect(ismMapRingIndexForRadius(1000, rings, rMin, rMax)).toBe(rings - 1);
  });

  it('degenerates to ring 0 for a single-ring grid, never NaN', () => {
    expect(ismMapRingIndexForRadius(5, 1, 1, 10)).toBe(0);
  });
});
