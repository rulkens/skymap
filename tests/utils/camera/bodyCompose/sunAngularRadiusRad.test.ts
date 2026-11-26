/** The radius and distance are converted separately; a slipped unit is off by orders of magnitude. */
import { expect, it } from 'vitest';

import { sunAngularRadiusRad } from '../../../../src/utils/camera/bodyCompose/sunAngularRadiusRad';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

it('gives the 0.267° solar disc radius at 1 AU', () => {
  const deg = (sunAngularRadiusRad([SCALE_UNITS.AU_TO_MPC, 0, 0], [0, 0, 0]) * 180) / Math.PI;
  expect(Math.abs(deg - 0.267)).toBeLessThan(0.001);
});
