import { describe, expect, it } from 'vitest';

import { angularRadiusRad } from '../../../src/utils/math/angularRadiusRad';

describe('angularRadiusRad', () => {
  it('the Sun from 1 au subtends 0.00465 rad', () => {
    // R = 696 340 km, d = 149 597 870.7 km; asin(R / d) = 0.004655 by hand.
    expect(angularRadiusRad(696_340, 149_597_870.7)).toBeCloseTo(0.004655, 5);
  });
});
