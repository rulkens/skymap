import { describe, expect, it } from 'vitest';

import { distanceOutsideSphere } from '../../../src/utils/camera/distanceOutsideSphere';

describe('distanceOutsideSphere', () => {
  const centre = [0, 0, 0] as const;
  it('leaves an eye outside the sphere where it is', () => {
    expect(distanceOutsideSphere([3, 0, 0], [1, 0, 0], 2, centre, 1)).toBe(2);
  });
  it('pushes an eye inside the sphere out to the far root', () => {
    expect(distanceOutsideSphere([1, 0, 0], [-1, 0, 0], 0.5, centre, 1)).toBeCloseTo(2, 12);
  });
  it('exits from a target inside the sphere', () => {
    expect(distanceOutsideSphere([0, 0, 0], [0, 1, 0], 0.1, centre, 1)).toBeCloseTo(1, 12);
  });
});
