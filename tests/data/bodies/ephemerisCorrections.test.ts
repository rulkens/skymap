/**
 * Planet and moon positions vs JPL Horizons at six dates (both span ends + the Voyager flybys).
 * Fixture query (one per target; Earth is 399, the rest as in HORIZONS_BODIES):
 * https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='199'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&CENTER='500@10'&REF_PLANE='FRAME'&TIME_TYPE='UT'&OUT_UNITS='KM-S'&CSV_FORMAT='YES'&VEC_TABLE='1'&TLIST_TYPE='JD'&TLIST='2415171.5' '2443937.5' '2444555.5' '2446454.5' '2447763.5' '2487855.5'
 * Moons (`horizonsMoons.json`, fetched 2026-10-05): the same query with each moon's target and
 * centre ('500@599' / '500@699'), TLIST = the Voyager Jupiter and Saturn flybys and both span ends
 * '2443938.003472222' '2444064.436805556' '2444556.490277778' '2444842.641666667' '2415171.5' '2487855.5'.
 * Fails when an element row or the frame changes without `npm run build-ephemeris-corrections`.
 */

import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { EPHEMERIS_CORRECTIONS } from '../../../src/data/bodies/ephemerisCorrections.generated';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import HORIZONS from '../../fixtures/horizonsPlanets.json';
import HORIZONS_MOONS from '../../fixtures/horizonsMoons.json';

// Earth is compared with 399 (Earth centre), so its error also carries the app Moon's
// error through the reflex: measured max 621 km, inside the planets' own bound.
const TOLERANCE_KM = 1000;

function relativeKm(id: string, centreId: string, jd: number): [number, number, number] {
  const states = deriveBodyStates(jd);
  const body = states.get(id)!.positionMpc;
  const centre = states.get(centreId)!.positionMpc;
  const k = 1 / SCALE_UNITS.KM_TO_MPC;
  return [(body[0] - centre[0]) * k, (body[1] - centre[1]) * k, (body[2] - centre[2]) * k];
}

describe('planet ephemeris', () => {
  it('every planet is within 1,000 km of Horizons at the fixture dates', () => {
    for (const [id, rows] of Object.entries(HORIZONS)) {
      for (const [jd, expected] of Object.entries(rows)) {
        const [x, y, z] = relativeKm(id, 'sun', Number(jd));
        const errKm = Math.hypot(x - expected[0]!, y - expected[1]!, z - expected[2]!);
        expect(errKm, `${id} at JD ${jd}`).toBeLessThan(TOLERANCE_KM);
      }
    }
  });
});

describe('moon ephemeris', () => {
  it('every moon is within 1,000 km of Horizons (parent-relative) on the fixture dates', () => {
    // The app's parent row is the system barycentre and Horizons' centre is the planet body
    // (measured apart ≤ 220 km at Jupiter, ≤ 312 km at Saturn), but moon − parent is the very
    // offset the fit targeted against that centre, so the barycentre never enters this difference.
    for (const [id, rows] of Object.entries(HORIZONS_MOONS)) {
      const parent = elementsById(id).focusId;
      for (const [jd, expected] of Object.entries(rows)) {
        const [x, y, z] = relativeKm(id, parent, Number(jd));
        const errKm = Math.hypot(x - expected[0]!, y - expected[1]!, z - expected[2]!);
        expect(errKm, `${id} at JD ${jd}`).toBeLessThan(TOLERANCE_KM);
      }
    }
  });

  it('a moon past 2100 is raw Kepler', () => {
    const jd = EPHEMERIS_CORRECTIONS.titan!.positionKm!.endJd + 1;
    const raw = keplerianPositionMpc(propagateElements(elementsById('titan'), jd));
    const [x, y, z] = relativeKm('titan', 'saturn', jd);
    const k = 1 / SCALE_UNITS.KM_TO_MPC;
    expect(Math.hypot(x - raw[0] * k, y - raw[1] * k, z - raw[2] * k)).toBeLessThan(1e-3);
  });
});
