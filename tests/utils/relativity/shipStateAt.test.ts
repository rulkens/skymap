import { describe, expect, it } from 'vitest';
import { shipStateAt } from '../../../src/utils/relativity/shipStateAt';
import { tripOf } from '../../../src/utils/relativity/tripOf';

describe('shipStateAt', () => {
  it.each([4.24, 2.54e6])('shipStateAt is continuous through the midpoint (d = %d ly)', (d) => {
    const mid = tripOf(d).tEarthTotalYr / 2;
    const before = shipStateAt(d, mid - 1e-6);
    const after = shipStateAt(d, mid + 1e-6);
    expect(before.phase).toBe('accelerating');
    expect(after.phase).toBe('decelerating');
    for (const key of ['xLy', 'beta', 'gamma', 'tauYr'] as const) {
      expect(Math.abs(after[key] - before[key])).toBeLessThan(1e-5 * Math.max(1, before[key]));
    }
  });

  it('shipStateAt past arrival is arrived at rest', () => {
    const d = 4.24;
    const state = shipStateAt(d, tripOf(d).tEarthTotalYr + 1);
    expect(state.phase).toBe('arrived');
    expect(state.gamma).toBe(1);
    expect(state.beta).toBe(0);
    expect(state.xLy).toBe(d);
    expect(state.tauYr).toBe(tripOf(d).tauTotalYr);
  });

  it('shipStateAt before launch is at rest at the start', () => {
    expect(shipStateAt(4.24, -1)).toEqual({
      tauYr: 0,
      xLy: 0,
      beta: 0,
      gamma: 1,
      phase: 'accelerating',
    });
  });
});
