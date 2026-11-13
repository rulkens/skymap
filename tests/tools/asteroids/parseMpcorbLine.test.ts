import { describe, expect, it } from 'vitest';

import { parseMpcorbLine } from '../../../tools/asteroids/parseMpcorbLine';

// Real lines of MPCORB.DAT fetched 2026-11-12 (the first data line, then three picked for their flags
// and designations).
const CERES =
  '00001    3.34  0.15 K2669 274.41935   73.29420   80.24863   10.58803  0.0796923  0.21430445   2.7655526  0 E2026-SD4  7376 127 1801-2026 0.82 M-v 30k MPCORBFIT  4000      (1) Ceres              20260922';
const APOPHIS =
  '99942   19.00  0.15 K2669 175.33041  126.67957  203.89365    3.34100  0.1911492  1.11263811   0.9223592  0 E2026-T09  9417  13 2004-2021 0.50 M-v 3Ek Pan        8802  (99942) Apophis            20210520';
const PROVISIONAL =
  '~0000   19.95  0.15 K2669  64.21331  160.37406  102.53589   21.41934  0.5522901  0.68266586   1.2774108  0 E2026-TC5   123   8 2010-2023 0.94 M-v 3Ek Pan        0803 (620000) 2019 YS4           20231204';
const SURVEY =
  '13440   15.62  0.15 K2669  61.56346  118.58149  329.46348    2.52817  0.1289659  0.23041658   2.6350785  0 MPO980724  1356  22 1960-2026 0.79 M-v 3Ek MPCORBFIT  0000  (13440) 2095 P-L           20260322';

describe('parseMpcorbLine', () => {
  it('reads Ceres', () => {
    const row = parseMpcorbLine(CERES);
    expect(row).toMatchObject({
      number: 1,
      h: 3.34,
      g: 0.15,
      epochJd: 2461200.5,
      meanAnomalyDeg: 274.41935,
      argPeriDeg: 73.2942,
      nodeDeg: 80.24863,
      inclDeg: 10.58803,
      e: 0.0796923,
      asteroidClass: 'mainBelt',
      name: 'Ceres',
    });
    expect(Math.abs(row.aAu - 2.7655526)).toBeLessThan(1e-7);
  });

  it('reads the orbit type from the flags', () => {
    expect(parseMpcorbLine(APOPHIS)).toMatchObject({ asteroidClass: 'nearEarth', name: 'Apophis' });
  });

  it('leaves a provisional or survey designation unnamed', () => {
    expect(parseMpcorbLine(PROVISIONAL)).toMatchObject({ number: 620000, name: null });
    expect(parseMpcorbLine(SURVEY).name).toBeNull();
  });

  it('reads a blank H or G as null', () => {
    const blank = `${CERES.slice(0, 8)}${' '.repeat(11)}${CERES.slice(19)}`;
    expect(parseMpcorbLine(blank)).toMatchObject({ h: null, g: null });
  });
});
