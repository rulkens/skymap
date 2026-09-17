import { describe, expect, it } from 'vitest';

import { constantSunField } from '../../../../tools/utils/textures/constantSunField';
import { sampleSunField } from '../../../../tools/utils/textures/sampleSunField';

describe('constantSunField', () => {
  it('samples the same g everywhere inside its bounds', () => {
    const bounds = { west: 0, east: 10, south: -5, north: 5 };
    const field = constantSunField(bounds, [0.4, -0.6]);
    expect(field.width).toBe(2);
    expect(field.height).toBe(2);

    for (const [lon, lat] of [
      [0, -5],
      [10, 5],
      [5, 0],
      [2, -3],
    ] as const) {
      const [gx, gy] = sampleSunField(field, lon, lat);
      expect(gx).toBeCloseTo(0.4, 6);
      expect(gy).toBeCloseTo(-0.6, 6);
    }
  });
});
