/**
 * Planet positions vs JPL Horizons at six dates (both span ends + the Voyager flybys).
 * Fixture query (one per target; Earth is 399, the rest as in fetchHorizonsPlanets):
 * https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='199'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&CENTER='500@10'&REF_PLANE='FRAME'&TIME_TYPE='UT'&OUT_UNITS='KM-S'&CSV_FORMAT='YES'&VEC_TABLE='1'&TLIST_TYPE='JD'&TLIST='2415171.5' '2443937.5' '2444555.5' '2446454.5' '2447763.5' '2487855.5'
 * Fails when an element row or the frame changes without `npm run build-planet-ephemeris`.
 */

import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import HORIZONS from '../../fixtures/horizonsPlanets.json';

// Earth is compared with 399 (Earth centre), so its error also carries the app Moon's
// error through the reflex: measured max 621 km, inside the planets' own bound.
const TOLERANCE_KM = 1000;

function heliocentricKm(id: string, jd: number): [number, number, number] {
  const states = deriveBodyStates(jd);
  const body = states.get(id)!.positionMpc;
  const sun = states.get('sun')!.positionMpc;
  const k = 1 / SCALE_UNITS.KM_TO_MPC;
  return [(body[0] - sun[0]) * k, (body[1] - sun[1]) * k, (body[2] - sun[2]) * k];
}

describe('planet ephemeris', () => {
  it('every planet is within 1,000 km of Horizons at the fixture dates', () => {
    for (const [id, rows] of Object.entries(HORIZONS)) {
      for (const [jd, expected] of Object.entries(rows)) {
        const [x, y, z] = heliocentricKm(id, Number(jd));
        const errKm = Math.hypot(x - expected[0]!, y - expected[1]!, z - expected[2]!);
        expect(errKm, `${id} at JD ${jd}`).toBeLessThan(TOLERANCE_KM);
      }
    }
  });
});
