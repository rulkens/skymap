/**
 * bodySlabCamAltitudeSq — the analytic sphere's quadratic constant, in f64.
 *
 * The one failure that matters is a loss of resolution: computed the way the
 * shader would (f32 `dot(camPosLocal, camPosLocal) − 1`), 10 m and 10.4 m above
 * Mars collapse to the same number, and the ground's depth quantises in 0.4 m
 * steps. These tests pin the value at contact range and pin that neighbouring
 * altitudes stay distinguishable.
 */

import { describe, expect, it } from 'vitest';

import { bodySlabCamAltitudeSq } from '../../../src/utils/camera/bodySlabCamAltitudeSq';

const MARS_RADIUS_M = 3_390_000;

describe('bodySlabCamAltitudeSq', () => {
  it('resolves a 10 m altitude above Mars to three significant digits', () => {
    // h/R = 10 / 3.39e6 = 2.9499e−6; the quadratic term is 9 orders down.
    expect(bodySlabCamAltitudeSq([0, 0, MARS_RADIUS_M + 10], MARS_RADIUS_M)).toBeCloseTo(
      5.8997e-6,
      9,
    );
  });

  it('separates 10 m from 10.4 m — the step the f32 route would swallow', () => {
    const at10 = bodySlabCamAltitudeSq([0, 0, MARS_RADIUS_M + 10], MARS_RADIUS_M);
    const at104 = bodySlabCamAltitudeSq([0, 0, MARS_RADIUS_M + 10.4], MARS_RADIUS_M);
    // 0.4 m is one f32 ulp of camPosLocal at this radius, so the difference is
    // exactly what the shader-side subtraction cannot see. Expected from the
    // definition: 2Δh/R plus the quadratic term's (h2² − h1²)/R².
    const expected = (2 * 0.4) / MARS_RADIUS_M + (10.4 ** 2 - 10 ** 2) / MARS_RADIUS_M ** 2;
    expect((at104 - at10) / expected).toBeCloseTo(1, 6);
  });
});
