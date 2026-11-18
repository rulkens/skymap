/**
 * The midsummer Sun over Copenhagen, hand-computed: due south at local noon,
 * 90° − 55.67° + 23.44° up, and in the east at breakfast. An east/west or
 * frame-order slip lands it north, or in the west in the morning.
 */

import { describe, expect, it } from 'vitest';

import { skyPoseOfBodyAt } from '../../../src/utils/geo/skyPoseOfBodyAt';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { degToRad } from '../../../src/utils/math/degToRad';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

const COPENHAGEN = {
  body: asSceneBodyId('earth'),
  lonRad: degToRad(12.52),
  latRad: degToRad(55.67),
};
const at = (h: number, m: number) => unixMsToJulianDays(Date.UTC(2026, 5, 21, h, m));

describe('skyPoseOfBodyAt', () => {
  it('stands the midsummer noon Sun due south at its height', () => {
    const noon = skyPoseOfBodyAt('sun', COPENHAGEN, at(11, 12));
    expect(Math.abs(Math.abs(noon.azimuthRad) - Math.PI)).toBeLessThan(degToRad(1));
    expect(noon.altitudeRad).toBeCloseTo(degToRad(90 - 55.67 + 23.44), 2);
  });

  it('puts the morning Sun in the east', () => {
    const morning = skyPoseOfBodyAt('sun', COPENHAGEN, at(6, 0));
    expect(morning.azimuthRad).toBeGreaterThan(degToRad(60));
    expect(morning.azimuthRad).toBeLessThan(degToRad(120));
  });
});
