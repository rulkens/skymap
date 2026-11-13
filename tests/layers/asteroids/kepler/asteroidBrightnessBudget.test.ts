/**
 * The brightness budget: the kept share by zoom, and the H limit that keeps that share of a class
 * from the catalog's sorted H columns (the fixture's meshed Ceres and Vesta left out, no-H row 3 sorted last).
 */
import { describe, expect, it } from 'vitest';
import { asteroidKeptFraction } from '../../../../src/layers/asteroids/kepler/utils/asteroidKeptFraction';
import { asteroidHLimitCenti } from '../../../../src/layers/asteroids/kepler/utils/asteroidHLimitCenti';
import { ASTEROID_FORMAT } from '../../../../src/data/asteroids/asteroidFormat';
import { loadedAsteroids } from '../fixtures/loadedAsteroids';

const ALL_ON = { nearEarth: 1, mainBelt: 1, hilda: 1, jupiterTrojan: 1 };
const THIN = { thinBudget: 100, thinStartZoomAu: 2, thinFullZoomAu: 12 };
const column = (n: number) => new Uint16Array(n);
const BY_CLASS = {
  nearEarth: column(0),
  mainBelt: column(800),
  hilda: column(0),
  jupiterTrojan: column(200),
};

describe('asteroidKeptFraction', () => {
  it('keeps everything up to the start zoom, the budget from the full zoom, falling between', () => {
    expect(asteroidKeptFraction(BY_CLASS, ALL_ON, 1e-6, THIN)).toBe(1);
    expect(asteroidKeptFraction(BY_CLASS, ALL_ON, 2, THIN)).toBe(1);
    expect(asteroidKeptFraction(BY_CLASS, ALL_ON, 12, THIN)).toBeCloseTo(0.1, 12);
    expect(asteroidKeptFraction(BY_CLASS, ALL_ON, 500, THIN)).toBeCloseTo(0.1, 12);
    const mid = asteroidKeptFraction(BY_CLASS, ALL_ON, Math.sqrt(24), THIN);
    expect(mid).toBeCloseTo(Math.sqrt(0.1), 12);
  });

  it('a class switched off frees its share for the rest', () => {
    const beltOff = { ...ALL_ON, mainBelt: 0 };
    expect(asteroidKeptFraction(BY_CLASS, beltOff, 12, THIN)).toBeCloseTo(0.5, 12);
    expect(asteroidKeptFraction(BY_CLASS, beltOff, 12, { ...THIN, thinBudget: 1e6 })).toBe(1);
  });
});

describe('asteroidHLimitCenti over the catalog H columns', () => {
  const belt = loadedAsteroids().catalog.hCentiByClass.mainBelt;
  const centi = (h: number) => Math.round((h + ASTEROID_FORMAT.hOffset) * ASTEROID_FORMAT.hScale);

  it('sorts the drawable rows by H, the no-H row last, the meshed rows left out', () => {
    expect([...belt]).toEqual([centi(4.1), centi(6.9), ASTEROID_FORMAT.hNone]);
  });

  it('keeps the brightest share, all rows at a fraction of 1', () => {
    expect(asteroidHLimitCenti(belt, 1)).toBe(ASTEROID_FORMAT.hNone);
    expect(asteroidHLimitCenti(belt, 0.5)).toBe(centi(6.9));
    expect(asteroidHLimitCenti(belt, 0.01)).toBe(centi(4.1));
    expect(asteroidHLimitCenti(new Uint16Array(0), 0.5)).toBe(ASTEROID_FORMAT.hNone);
  });
});
