/**
 * Reference values from JPL Horizons, fetched 2026-11-12, one query per body (COMMAND '3;', '433;', '624;'):
 * https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='3%3B'&OBJ_DATA='YES'&MAKE_EPHEM='YES'
 *   &EPHEM_TYPE='OBSERVER'&CENTER='500@399'&TLIST='2461041.5'&TLIST_TYPE='JD'&TIME_TYPE='TT'
 *   &QUANTITIES='9,19,20,24'&EXTRA_PREC='YES'
 * H and G are Horizons' own (its OBJ_DATA block); r, delta, S-T-O and APmag at 2026-01-01 00:00 TT.
 */
import { describe, expect, it } from 'vitest';

import { asteroidApparentMagnitude } from '../../../src/utils/photometry/asteroidApparentMagnitude';

const HORIZONS = [
  {
    name: '3 Juno',
    h: 5.19,
    g: 0.32,
    r: 3.210418317164,
    delta: 4.15659448044505,
    alphaDeg: 4.1984,
    v: 11.117,
  },
  {
    name: '433 Eros',
    h: 10.4,
    g: 0.46,
    r: 1.187338043616,
    delta: 0.41587615865974,
    alphaDeg: 51.4174,
    v: 10.251,
  },
  {
    name: '624 Hektor',
    h: 7.32,
    g: 0.15,
    r: 5.151342385254,
    delta: 5.00245736690585,
    alphaDeg: 10.9902,
    v: 15.062,
  },
];

describe('asteroidApparentMagnitude', () => {
  it.each(HORIZONS)('matches Horizons V for $name', ({ h, g, r, delta, alphaDeg, v }) => {
    const cosPhase = Math.cos((alphaDeg * Math.PI) / 180);
    expect(Math.abs(asteroidApparentMagnitude(h, g, r, delta, cosPhase) - v)).toBeLessThan(0.05);
  });

  it('opposition gives the brightest V and no NaN at cosα = 1', () => {
    const atOpposition = asteroidApparentMagnitude(15, 0.15, 2.5, 1.5, 1);
    expect(atOpposition).toBeCloseTo(15 + 5 * Math.log10(2.5 * 1.5), 6);
    for (const cosPhase of [0.99, 0.5, 0, -0.5, -1]) {
      expect(asteroidApparentMagnitude(15, 0.15, 2.5, 1.5, cosPhase)).toBeGreaterThan(atOpposition);
    }
    // A G above 1 at α = 180° is the guards' case: finite, not NaN.
    expect(Number.isFinite(asteroidApparentMagnitude(15, 2, 2.5, 1.5, -1))).toBe(true);
  });
});
