import { describe, expect, it } from 'vitest';

import type { MpcorbRow } from '../../../../tools/@types/asteroids/MpcorbRow';
import { writeAsteroidCatalog } from '../../../../tools/utils/io/writeAsteroidCatalog';
import { parseAsteroidCatalog } from '../../../../src/layers/asteroids/catalog/load/parseAsteroidCatalog';
import { asteroidHelioAu } from '../../../../src/layers/asteroids/kepler/utils/asteroidHelioAu';
import { eccentricAnomalyFromMean } from '../../../../src/utils/orbit/eccentricAnomalyFromMean';

const EPOCH = 2461200.5;
const ROW: MpcorbRow = {
  number: 1,
  h: 10.4,
  g: 0.15,
  epochJd: EPOCH,
  meanAnomalyDeg: 41.6,
  argPeriDeg: 178.9,
  nodeDeg: 304.3,
  inclDeg: 10.8,
  e: 0.2229,
  aAu: 1.458,
  orbitType: 0,
  asteroidClass: 'nearEarth',
  neo: true,
  pha: false,
  name: 'Eros',
};

describe('asteroidHelioAu', () => {
  it('asteroidHelioAu matches the decoded basis at the epoch', () => {
    const { bytes } = writeAsteroidCatalog([ROW], EPOCH);
    const cat = parseAsteroidCatalog(bytes.buffer as ArrayBuffer);
    const [ax, ay, az, e] = cat.elementsA;
    const [bx, by, bz] = cat.elementsB;
    const E = eccentricAnomalyFromMean(cat.m0[0]!, e!);
    const x = Math.cos(E) - e!;
    const y = Math.sin(E);
    const expected = [ax! * x + bx! * y, ay! * x + by! * y, az! * x + bz! * y];
    asteroidHelioAu(cat, 0, EPOCH).forEach((v, axis) => expect(v).toBeCloseTo(expected[axis]!, 12));
  });
});
