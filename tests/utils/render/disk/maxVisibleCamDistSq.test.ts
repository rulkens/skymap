import { describe, it, expect } from 'vitest';
import { maxVisibleCamDistSq } from '../../../../src/utils/render/disk/maxVisibleCamDistSq';
import { apparentSizePxAtDistance } from '../../../../src/utils/render/disk/apparentSizePxAtDistance';

describe('maxVisibleCamDistSq', () => {
  it('is the squared distance at which the max-diameter galaxy hits exactly minPx', () => {
    const minPx = 24,
      pxPerRad = 1000,
      dMaxKpc = 200;
    const distSq = maxVisibleCamDistSq(minPx, pxPerRad, dMaxKpc);
    // At sqrt(distSq), a dMaxKpc galaxy subtends exactly minPx.
    expect(apparentSizePxAtDistance(dMaxKpc, Math.sqrt(distSq), pxPerRad)).toBeCloseTo(minPx, 6);
  });

  it('defaults the max diameter to 200 kpc', () => {
    expect(maxVisibleCamDistSq(24, 1000)).toBe(maxVisibleCamDistSq(24, 1000, 200));
  });
});
