import { describe, expect, it } from 'vitest';
import { tripOf } from '../../../src/utils/relativity/tripOf';

/** Within half a unit of the third significant figure. */
function expectThreeFigures(actual: number, expected: number): void {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(5e-3);
}

describe('tripOf', () => {
  it.each([
    { d: 4.24, tau: 3.54, t: 5.87, gamma: 3.19 },
    { d: 26.7e3, tau: 19.8, t: 26.7e3, gamma: 1.38e4 },
    { d: 2.54e6, tau: 28.6, t: 2.54e6, gamma: 1.31e6 },
    { d: 54.7e6, tau: 34.6, t: 54.7e6, gamma: 2.83e7 },
  ])(
    'tripOf matches the four reference trips to three figures (d = $d ly)',
    ({ d, tau, t, gamma }) => {
      const trip = tripOf(d);
      expectThreeFigures(trip.tauTotalYr, tau);
      expectThreeFigures(trip.tEarthTotalYr, t);
      expectThreeFigures(trip.gammaMax, gamma);
    },
  );

  it.each([2.54e6, 54.7e6])(
    'tripOf: remaining distance at turnaround tends to 2/A (d = %d ly)',
    (d) => {
      const remainingLy = d / tripOf(d).gammaMax;
      expect(Math.abs(remainingLy / 1.94 - 1)).toBeLessThan(0.01);
    },
  );
});
