import { describe, it, expect } from 'vitest';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { propagateElements } from '../../../src/utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../src/utils/orbit/keplerianPositionMpc';
import { ECLIPTIC_FRAME } from '../../../src/data/bodies/orbitPlaneFrames';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const io = elementsById('io');

describe('satellite() moon elements', () => {
  it("Io's mean-motion rate implies its ~1.77-day orbital period", () => {
    // Independent physical anchor, not a restatement of the rate constant: Io
    // laps Jupiter in about 1.77 days. Recover that period FROM the stored
    // per-century mean-anomaly rate — turns/century = rate / 2π, and the period
    // is 36525 days / turns. (The JPL column is the *anomalistic* 1.762732 d,
    // ~0.4% under the 1.769 d sidereal period; both round to ~1.77.) A units slip
    // — per-year vs per-century, or a dropped 2π — misses 1.77 by far more than
    // the 0.05-day tolerance here.
    const turnsPerCentury = io.meanAnomalyRateRadPerCty! / (2 * Math.PI);
    const impliedPeriodDays = 36_525 / turnsPerCentury;
    expect(impliedPeriodDays).toBeCloseTo(1.77, 1);
  });

  it('matches a JPL Horizons reference for Io relative to Jupiter', () => {
    // External contract, and the load-bearing frame/sign/unit check for the whole
    // moon path. Reference: JPL Horizons geometric state vector of Io (target
    // '501') relative to Jupiter body center (center '500@599'), Ecliptic of
    // J2000 (REF_PLANE='ECLIPTIC'), at JD 2455198.0 TDB (2010-Jan-01 12:00),
    // OUT_UNITS='KM-S', VEC_TABLE='1' (verified 2026-07-21):
    //   X =  3.405621456428792E+05 km
    //   Y = -2.491330105433191E+05 km
    //   Z = -4.082960674869799E+03 km
    //
    // keplerianPositionMpc returns Io's focus-relative offset (focus = Jupiter,
    // matching Horizons' center) in the scene's EQUATORIAL-world frame. Horizons
    // reports it in the ECLIPTIC frame, so rotate the reference into equatorial
    // through ECLIPTIC_FRAME (the same basis the ellipse math uses), then km→Mpc.
    //
    // Tolerance is 5% of Io's semi-major axis (~21,000 km): the JPL MEAN elements
    // are not arcminute-exact for a moon, and the epoch mean anomaly is propagated
    // ~2072 orbits to 2010. The test exists to catch a wrong frame, a flipped
    // precession sign, or a km/Mpc slip — any of which misses by a large fraction
    // of the orbit — not to validate the ephemeris model to arcseconds.
    const horizonsEclKm: Vec3 = [
      3.405621456428792e5,
      -2.491330105433191e5,
      -4.082960674869799e3,
    ];
    const F = ECLIPTIC_FRAME;
    const eqWorldKm: Vec3 = [
      horizonsEclKm[0] * F.xAxis[0] + horizonsEclKm[1] * F.yAxis[0] + horizonsEclKm[2] * F.normal[0],
      horizonsEclKm[0] * F.xAxis[1] + horizonsEclKm[1] * F.yAxis[1] + horizonsEclKm[2] * F.normal[1],
      horizonsEclKm[0] * F.xAxis[2] + horizonsEclKm[1] * F.yAxis[2] + horizonsEclKm[2] * F.normal[2],
    ];
    const expectedMpc = eqWorldKm.map((km) => km * SCALE_UNITS.KM_TO_MPC) as Vec3;

    const posMpc = keplerianPositionMpc(propagateElements(io, 2_455_198.0));

    const dx = posMpc[0] - expectedMpc[0];
    const dy = posMpc[1] - expectedMpc[1];
    const dz = posMpc[2] - expectedMpc[2];
    const errKm = Math.sqrt(dx * dx + dy * dy + dz * dz) / SCALE_UNITS.KM_TO_MPC;

    expect(errKm).toBeLessThan(0.05 * 421_800);
  });

  it('propagates a moon ±Δ symmetrically about the epoch', () => {
    // The affine map is absolute in simDays, so equal steps either side of J2000
    // land equal distances from the epoch value — for a moon's mean anomaly AND
    // its (non-zero-rate) argument of periapsis, exercising both propagated angles.
    const dDays = 1000;
    const forward = propagateElements(io, CONST_J2000 + dDays);
    const backward = propagateElements(io, CONST_J2000 - dDays);

    const meanFwd = forward.meanAnomalyRad - io.meanAnomalyRad;
    const meanBwd = io.meanAnomalyRad - backward.meanAnomalyRad;
    expect(meanFwd).toBeCloseTo(meanBwd, 10);

    const apsisFwd = forward.argPeriapsisRad - io.argPeriapsisRad;
    const apsisBwd = io.argPeriapsisRad - backward.argPeriapsisRad;
    expect(apsisFwd).toBeCloseTo(apsisBwd, 12);
  });
});
