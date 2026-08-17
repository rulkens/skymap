import { describe, it, expect } from 'vitest';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { OrbitalElements } from '../../../src/@types/scene/OrbitalElements';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const J2000_JD = 2_451_545.0;
const earth = elementsById('earth');

describe('propagateElements', () => {
  it('at T=0 (J2000) returns the epoch elements unchanged', () => {
    // simDays = the J2000 Julian Date ⇒ zero elapsed centuries ⇒ every classical
    // field must equal its epoch value regardless of its rate. A genuine fixed
    // point of the affine map, not a restatement of the rate arithmetic.
    const at0 = propagateElements(earth, J2000_JD);

    expect(at0.semiMajorMpc).toBe(earth.semiMajorMpc);
    expect(at0.eccentricity).toBe(earth.eccentricity);
    expect(at0.inclinationRad).toBe(earth.inclinationRad);
    expect(at0.ascendingNodeRad).toBe(earth.ascendingNodeRad);
    expect(at0.argPeriapsisRad).toBe(earth.argPeriapsisRad);
    expect(at0.meanAnomalyRad).toBe(earth.meanAnomalyRad);
  });

  it('leaves a rate-less body untouched (static propagates to itself)', () => {
    // The Moon carries no rate fields (Task 5 owns satellite rates), so it must
    // propagate to itself at any epoch — the optional-rate contract.
    const staticBody: OrbitalElements = {
      id: 'x',
      focusId: 'sun',
      semiMajorMpc: 3,
      eccentricity: 0.1,
      inclinationRad: 0.2,
      ascendingNodeRad: 0.3,
      argPeriapsisRad: 0.4,
      meanAnomalyRad: 0.5,
      color: [1, 1, 1],
    };
    const advanced = propagateElements(staticBody, J2000_JD + 5_000_000);

    expect(advanced.meanAnomalyRad).toBe(0.5);
    expect(advanced.semiMajorMpc).toBe(3);
    expect(advanced.eccentricity).toBe(0.1);
  });

  it("advances Earth's mean anomaly ~one revolution per year", () => {
    // Independent physical property (Earth orbits the Sun once a year), not a
    // restatement of the source rate constant: propagate one Julian year and the
    // mean anomaly must advance by very nearly 2π.
    const afterOneYear = propagateElements(earth, J2000_JD + 365.25);
    const deltaM = afterOneYear.meanAnomalyRad - earth.meanAnomalyRad;

    expect(deltaM).toBeCloseTo(2 * Math.PI, 3);
  });

  it('is symmetric about the epoch for the linear fields', () => {
    // The map is affine and absolute in simDays, so equal steps forward and back
    // from J2000 land equal distances either side of the epoch value.
    const dDays = 1000;
    const forward = propagateElements(earth, J2000_JD + dDays);
    const backward = propagateElements(earth, J2000_JD - dDays);

    const meanForward = forward.meanAnomalyRad - earth.meanAnomalyRad;
    const meanBackward = earth.meanAnomalyRad - backward.meanAnomalyRad;
    expect(meanForward).toBeCloseTo(meanBackward, 10);

    const aForward = forward.semiMajorMpc - earth.semiMajorMpc;
    const aBackward = earth.semiMajorMpc - backward.semiMajorMpc;
    expect(aForward).toBeCloseTo(aBackward, 18);
  });

  it("matches a JPL Horizons reference for Earth's heliocentric position", () => {
    // External contract. Reference: JPL Horizons vector ephemeris for the
    // Earth–Moon Barycenter (target '3') relative to the Sun's centre
    // ('500@10'), ICRF/J2000 equatorial frame (REF_PLANE='FRAME'), at
    // 2025-Jan-01 00:00:00 TDB = Julian Date 2460676.5 (verified 2026-07-21).
    //
    // Request (GET):
    //   https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='3'
    //     &OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='VECTORS'&CENTER='500@10'
    //     &REF_PLANE='FRAME'&TLIST='2460676.5'&OUT_UNITS='AU-D'&VEC_TABLE='1'
    //
    // Returned state vector (au, ICRF equatorial):
    //   X = -1.786710910310161E-01
    //   Y =  8.871846912692936E-01
    //   Z =  3.845832338744293E-01
    //
    // The scene frame is equatorial J2000 (keplerianEllipse rotates the ecliptic
    // elements through ECLIPTIC_FRAME), matching Horizons' ICRF frame to sub-
    // arcsecond bias. Tolerance is arcminute-class: the mean-element model differs
    // from the true DE ephemeris by ~1 arcmin (~2e-4 au at 1 au), and the scene's
    // rounded 23.44° obliquity adds ~2 arcsec. A frame swap, unit slip, or sign
    // error in a rate would miss by ≥0.05 au and fail loudly.
    const simDays = 2_460_676.5;
    const horizonsAu: Vec3 = [-1.786710910310161e-1, 8.871846912692936e-1, 3.845832338744293e-1];
    const expectedMpc = horizonsAu.map((au) => au * SCALE_UNITS.AU_TO_MPC) as Vec3;

    const posMpc = keplerianPositionMpc(propagateElements(earth, simDays));

    const dx = posMpc[0] - expectedMpc[0];
    const dy = posMpc[1] - expectedMpc[1];
    const dz = posMpc[2] - expectedMpc[2];
    const errAu = Math.sqrt(dx * dx + dy * dy + dz * dz) / SCALE_UNITS.AU_TO_MPC;

    expect(errAu).toBeLessThan(0.002);
  });
});
