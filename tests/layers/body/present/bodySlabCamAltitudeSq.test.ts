/**
 * bodySlabCamAltitudeSq (f64): in f32 `dot(camPosLocal, camPosLocal) − 1`, 10 m and 10.4 m above
 * Mars collapse to one number (0.4 m depth steps); pinned at contact range.
 */

import { describe, expect, it } from 'vitest';

import { bodySlabCamAltitudeSq } from '../../../../src/layers/body/present/bodySlabCamAltitudeSq';

const MARS_RADIUS_M = 3_390_000;

describe('bodySlabCamAltitudeSq', () => {
  it('resolves a 10 m altitude above Mars to three significant digits', () => {
    // h/R = 10 / 3.39e6 = 2.9499e−6; the quadratic term is 9 orders down.
    expect(bodySlabCamAltitudeSq([0, 0, MARS_RADIUS_M + 10], MARS_RADIUS_M)).toBeCloseTo(
      5.8997e-6,
      9,
    );
  });
});
