import { describe, expect, it } from 'vitest';

import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { bodyRadiusMpc } from '../../../src/utils/camera/bodyRadiusMpc';

describe('bodyRadiusMpc', () => {
  it('reads Earth and the Sun', () => {
    expect(bodyRadiusMpc('earth') / SCALE_UNITS.KM_TO_MPC).toBeCloseTo(6371, -1);
    expect(bodyRadiusMpc(undefined) / SCALE_UNITS.KM_TO_MPC).toBeCloseTo(696340, 0);
  });
});
