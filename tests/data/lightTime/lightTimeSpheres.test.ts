import { describe, it, expect } from 'vitest';
import { LIGHT_TIME_SPHERES } from '../../../src/data/lightTime/lightTimeSpheres';

describe('LIGHT_TIME_SPHERES', () => {
  it('radii strictly ascend and ids are unique', () => {
    expect(LIGHT_TIME_SPHERES).toHaveLength(15);
    const radii = LIGHT_TIME_SPHERES.map((s) => s.radiusMpc);
    expect(radii.every((r, i) => i === 0 || r > radii[i - 1]!)).toBe(true);
    expect(new Set(LIGHT_TIME_SPHERES.map((s) => s.id)).size).toBe(LIGHT_TIME_SPHERES.length);
  });
});
