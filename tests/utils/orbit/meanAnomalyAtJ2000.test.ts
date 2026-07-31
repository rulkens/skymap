import { describe, it, expect } from 'vitest';

import { meanAnomalyAtJ2000 } from '../../../src/utils/orbit/meanAnomalyAtJ2000';

describe('meanAnomalyAtJ2000', () => {
  it('a star at pericentre in 2000.0 has mean anomaly zero', () => {
    expect(meanAnomalyAtJ2000(2000.0, 16.0)).toBeCloseTo(0, 12);
  });

  it('S2 at Tp 2002.33 with P 16.0 wraps into [0, 2π)', () => {
    // Tp is after 2000, so the raw M = 2π(2000 − Tp)/P is negative — the
    // majority case in the real table. Hand-computed: raw = 2π·(−2.33)/16 =
    // −0.91498886…; + 2π = 5.36819644682…
    const m = meanAnomalyAtJ2000(2002.33, 16.0);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(2 * Math.PI);
    expect(m).toBeCloseTo(5.368196446822, 9);
  });

  it('a pericentre before 2000 (S87: Tp 611.0, P 1640.0) is unchanged by the wrap', () => {
    // Tp is before 2000, so raw = 2π(2000 − 611)/1640 is already positive
    // and under 2π — the wrap must leave it alone. Hand-computed:
    // raw = 2π·1389/1640 = 5.321551458337…
    expect(meanAnomalyAtJ2000(611.0, 1640.0)).toBeCloseTo(5.321551458337, 9);
  });

  it('advancing by exactly one — or two — periods returns the same anomaly', () => {
    // Tp = 2003, P = 10: raw = 2π·(−0.3) = −1.884955592154, wraps to
    // 4.398229715026. Shifting Tp back by exactly one period (1993) lands
    // raw already inside [0, 2π) at the same value; shifting back by TWO
    // periods (1983, |2000 − Tp| = 17 yr > P) exercises the multi-period
    // fold, not just a single wraparound.
    const expected = 4.398229715026;
    expect(meanAnomalyAtJ2000(2003, 10)).toBeCloseTo(expected, 9);
    expect(meanAnomalyAtJ2000(1993, 10)).toBeCloseTo(expected, 9);
    expect(meanAnomalyAtJ2000(1983, 10)).toBeCloseTo(expected, 9);
  });
});
