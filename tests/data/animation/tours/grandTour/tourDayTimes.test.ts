/**
 * The tour's day is three instants read off one date: noon, sunset, night.
 * Moving the date means moving all three, and beat 00's pan is derived from
 * them, so a stale one turns the opening away from the Sun.
 */

import { describe, expect, it } from 'vitest';

import { SONDERMARKEN_SPOT } from '../../../../../src/data/animation/tours/grandTour/sondermarkenSpot';
import { TOUR_NIGHT_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourNightSimDays';
import { TOUR_NOON_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourNoonSimDays';
import { TOUR_SUNSET_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourSunsetSimDays';
import { skyPoseOfBodyAt } from '../../../../../src/utils/geo/skyPoseOfBodyAt';
import { degToRad } from '../../../../../src/utils/math/degToRad';
import { wrapRad } from '../../../../../src/utils/math/wrapRad';

const sunAt = (simDays: number) => skyPoseOfBodyAt('sun', SONDERMARKEN_SPOT, simDays);

describe('grand tour day times', () => {
  it('stands the Sun due south at noon and on the horizon at sunset', () => {
    expect(Math.abs(wrapRad(sunAt(TOUR_NOON_SIM_DAYS).azimuthRad - Math.PI))).toBeLessThan(
      degToRad(1),
    );
    expect(Math.abs(sunAt(TOUR_SUNSET_SIM_DAYS).altitudeRad)).toBeLessThan(degToRad(0.5));
  });

  it('falls at night past astronomical dusk with the Moon still down', () => {
    expect(sunAt(TOUR_NIGHT_SIM_DAYS).altitudeRad).toBeLessThan(degToRad(-18));
    expect(
      skyPoseOfBodyAt('moon', SONDERMARKEN_SPOT, TOUR_NIGHT_SIM_DAYS).altitudeRad,
    ).toBeLessThan(0);
  });
});
