/**
 * satellite — row maker for a planet's guidance MOON, transcribed from one row
 * of JPL "Planetary Satellite Mean Orbital Parameters" (epoch 2000-01-01.5 TDB).
 *
 * Every column of a moon's row lands here in the units JPL publishes (km,
 * degrees, days, years) so the many numbers can't be mis-ordered at the call
 * site, and the maker does three conversions:
 *
 * - **Epoch phases** Ω/ω/M are REAL (`ascendingNodeDeg`/`argPeriapsisDeg`/
 *   `meanAnomalyDeg`), placing the moon at its true J2000 position — not the
 *   old placeholder `0` that pinned every moon to periapsis.
 * - **Periods → rates**: JPL gives a precessing mean ellipse as the mean-motion/
 *   apsidal/nodal periods (`periodDays`/`apsidalPrecessionYears`/
 *   `nodalPrecessionYears`); `moonRatesFromPeriods` turns them into the same
 *   per-century rate fields the planets carry, so `propagateElements` stays one
 *   branch-free affine map. (That helper owns the +apsis/−node sign convention
 *   and the 0-period "no precession" sentinel — see its header.)
 * - **Plane from the moon's OWN Laplace pole**: JPL references each moon to its
 *   local Laplace plane and tabulates that plane's pole (`poleRaDeg`/
 *   `poleDecDeg`). Building the frame per-moon via `planeFrameFromPole` (the
 *   same derivation the parent-equatorial frames use) is truthful for a distant
 *   moon whose Laplace plane tilts off the equator (Iapetus ~15°); for the
 *   regular inner moons the pole ≈ the planet's equatorial pole, so their planes
 *   stay essentially where the shared `*_EQUATORIAL_FRAME` constant put them.
 *
 * Lives beside `ORBITAL_ELEMENTS` in `makers/` rather than in `src/utils/`: it
 * is authoring policy, has a single consumer (the element table), and maker and
 * table change together.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { degToRad } from '../../../utils/math/degToRad';
import { moonRatesFromPeriods } from '../../../utils/orbit/moonRatesFromPeriods';
import { planeFrameFromPole } from '../orbitPlaneFrames';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../../@types/math/Vec3';

export function satellite(spec: {
  id: string;
  focusId: string;
  semiMajorKm: number;
  eccentricity: number;
  inclinationDeg: number;
  ascendingNodeDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyDeg: number;
  periodDays: number;
  apsidalPrecessionYears: number;
  nodalPrecessionYears: number;
  poleRaDeg: number;
  poleDecDeg: number;
  color: Vec3;
}): OrbitalElements {
  return {
    id: spec.id,
    focusId: spec.focusId,
    semiMajorMpc: spec.semiMajorKm * SCALE_UNITS.KM_TO_MPC,
    eccentricity: spec.eccentricity,
    inclinationRad: degToRad(spec.inclinationDeg),
    ascendingNodeRad: degToRad(spec.ascendingNodeDeg),
    argPeriapsisRad: degToRad(spec.argPeriapsisDeg),
    meanAnomalyRad: degToRad(spec.meanAnomalyDeg),
    ...moonRatesFromPeriods({
      periodDays: spec.periodDays,
      apsidalPrecessionYears: spec.apsidalPrecessionYears,
      nodalPrecessionYears: spec.nodalPrecessionYears,
    }),
    color: spec.color,
    plane: planeFrameFromPole(spec.poleRaDeg, spec.poleDecDeg),
  };
}
