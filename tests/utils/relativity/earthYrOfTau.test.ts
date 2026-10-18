import { describe, expect, it } from 'vitest';
import { earthYrOfTau } from '../../../src/utils/relativity/earthYrOfTau';
import { shipStateAt } from '../../../src/utils/relativity/shipStateAt';
import { tripOf } from '../../../src/utils/relativity/tripOf';

describe('earthYrOfTau', () => {
  it.each([4.24, 2.54e6])('earthYrOfTau inverts shipStateAt (d = %d ly)', (d) => {
    const { tauTotalYr } = tripOf(d);
    for (let i = 0; i < 10; i += 1) {
      const tau = ((i + 0.5) / 10) * tauTotalYr;
      expect(shipStateAt(d, earthYrOfTau(d, tau)).tauYr).toBeCloseTo(tau, 6);
    }
  });

  it('earthYrOfTau clamps to launch and arrival', () => {
    const d = 4.24;
    expect(earthYrOfTau(d, -1)).toBe(0);
    expect(earthYrOfTau(d, tripOf(d).tauTotalYr + 1)).toBe(tripOf(d).tEarthTotalYr);
  });
});
