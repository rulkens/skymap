import { describe, expect, it } from 'vitest';
import { exoplanetOrbitPlaneBasis } from '../../../../src/layers/structure/present/exoplanetOrbitPlaneBasis';
import { cross3 } from '../../../../src/utils/math/cross3';
import { dot3 } from '../../../../src/utils/math/dot3';
import { normalize3 } from '../../../../src/utils/math/normalize3';

const host: [number, number, number] = [3, -1, 0.5];
const away = normalize3(host);

describe('exoplanetOrbitPlaneBasis', () => {
  it('puts an edge-on planet at mid-transit between its host and the Sun', () => {
    const { u, v } = exoplanetOrbitPlaneBasis(host, 90);
    [0, 1, 2].forEach((k) => expect(u[k]).toBeCloseTo(-away[k]!, 12));
    expect(dot3(v, away)).toBeCloseTo(0, 12);
  });

  it('turns the plane to face us at zero or unmeasured inclination', () => {
    for (const inclination of [0, null]) {
      const { u, v } = exoplanetOrbitPlaneBasis(host, inclination);
      expect(Math.abs(dot3(cross3(u, v), away))).toBeCloseTo(1, 12);
    }
  });

  it('tilts the plane normal off our line of sight by the inclination', () => {
    const { u, v } = exoplanetOrbitPlaneBasis(host, 30);
    expect(dot3(u, v)).toBeCloseTo(0, 12);
    expect(Math.abs(dot3(cross3(u, v), away))).toBeCloseTo(Math.cos(Math.PI / 6), 12);
  });
});
