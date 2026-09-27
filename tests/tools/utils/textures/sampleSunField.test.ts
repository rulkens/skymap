import { describe, expect, it } from 'vitest';

import { sampleSunField } from '../../../../tools/utils/textures/sampleSunField';
import type { SunField } from '../../../../tools/textures/SunField';

function field(): SunField {
  return {
    bounds: { west: 0, east: 2, south: 0, north: 2 },
    width: 2,
    height: 2,
    gx: new Float32Array([0, 0.2, 0.4, 0.6]),
    gy: new Float32Array([1, 1.2, 1.4, 1.6]),
    confidence: new Float32Array(4).fill(1),
    radiusM: 3_390_000,
  };
}

describe('sampleSunField', () => {
  it('matches a corner post exactly', () => {
    const f = field();
    const [gx, gy] = sampleSunField(f, 2, 2); // top-right post: index 1
    expect(gx).toBeCloseTo(0.2, 6);
    expect(gy).toBeCloseTo(1.2, 6);
  });

  it('interpolates at the centre', () => {
    const f = field();
    const [gx, gy] = sampleSunField(f, 1, 1);
    expect(gx).toBeCloseTo((0 + 0.2 + 0.4 + 0.6) / 4, 6);
    expect(gy).toBeCloseTo((1 + 1.2 + 1.4 + 1.6) / 4, 6);
  });
});
