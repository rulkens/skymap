import { describe, expect, it } from 'vitest';

import { sinSunAngularRadius } from '../../../src/utils/occlusion/sinSunAngularRadius';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('sinSunAngularRadius', () => {
  it('converts the Mpc separation to metres before taking the ratio', () => {
    // 1 au in Mpc against the Sun's radius in metres: sin(asin(R / d)) = 0.004655.
    const auMpc = 149_597_870_700 * SCALE_UNITS.M_TO_MPC;
    expect(sinSunAngularRadius([auMpc, 0, 0], [0, 0, 0], 696_340_000)).toBeCloseTo(0.004655, 5);
  });
});
