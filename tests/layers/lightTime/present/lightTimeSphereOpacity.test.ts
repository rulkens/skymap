import { describe, it, expect } from 'vitest';
import { lightTimeSphereOpacity } from '../../../../src/layers/lightTime/present/lightTimeSphereOpacity';

describe('lightTimeSphereOpacity', () => {
  it('is 0 inside 1.2 radii, 1 between 2 and 12, 0 beyond 40', () => {
    expect(lightTimeSphereOpacity(1.1, 1)).toBe(0);
    expect(lightTimeSphereOpacity(1.2, 1)).toBe(0);
    expect(lightTimeSphereOpacity(2, 1)).toBe(1);
    expect(lightTimeSphereOpacity(7, 1)).toBe(1);
    expect(lightTimeSphereOpacity(12, 1)).toBe(1);
    expect(lightTimeSphereOpacity(40, 1)).toBe(0);
    expect(lightTimeSphereOpacity(100, 1)).toBe(0);
  });
});
