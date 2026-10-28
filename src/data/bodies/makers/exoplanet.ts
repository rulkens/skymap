/**
 * exoplanet — one archive row (`ExoplanetSeed`) → a drawable `PlanetBody` and
 * its `OrbitalElements`, the one site of this table's unit and frame choices.
 *
 * The reference plane is the sky at the host (`orbiter`'s pole = the host's
 * RA/Dec, so the plane normal points away from us). Inclination fixes the tilt;
 * the node's position angle is unmeasured for a transiting planet and is 0 by
 * convention, with ω = 0 too. At mid-transit the planet is nearest us, which is
 * true anomaly 270° in that frame, so the transit time is the epoch.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { BODY_GLINT_MAX_PX } from '../bodyGlintMaxPx';
import { EXOPLANET_TRAIL } from '../palette';
import { FAMOUS_STARS_GENERATED } from '../famousStars.generated';
import { orbiter } from './orbiter';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import type { ExoplanetSeed } from '../../../@types/scene/ExoplanetSeed';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { Vec3 } from '../../../@types/math/Vec3';

const EARTH_RADIUS_KM = 6371;
const TRANSIT_TRUE_ANOMALY_RAD = (3 * Math.PI) / 2;
// Dark rock: JWST's thermal phase curves put b and c at low albedo; the rest are unmeasured.
const ROCKY_ALBEDO: Vec3 = [0.2, 0.19, 0.18];

/** Mean anomaly at a true anomaly ν, in degrees, through the eccentric anomaly. */
function meanAnomalyDeg(trueAnomalyRad: number, e: number): number {
  const half = trueAnomalyRad / 2;
  const eAnom = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(half), Math.sqrt(1 + e) * Math.cos(half));
  return ((eAnom - e * Math.sin(eAnom)) * 180) / Math.PI;
}

export function exoplanet(seed: ExoplanetSeed): { body: PlanetBody; elements: OrbitalElements } {
  const host = FAMOUS_STARS_GENERATED.find((row) => row.id === seed.hostId);
  if (host === undefined) throw new Error(`exoplanet: ${seed.id}'s host ${seed.hostId} is no famous star`);
  return {
    body: {
      id: asSceneBodyId(seed.id),
      label: seed.label,
      surface: { datumRadiusM: seed.radiusEarth * EARTH_RADIUS_KM * SCALE_UNITS.KM_TO_M, reliefM: [0, 0] },
      albedo: ROCKY_ALBEDO,
      resolvePx: BODY_GLINT_MAX_PX,
    },
    elements: orbiter({
      id: seed.id,
      focusId: seed.hostId,
      epochJd: seed.transitJd,
      semiMajorKm: (seed.semiMajorAu * SCALE_UNITS.AU_TO_MPC) / SCALE_UNITS.KM_TO_MPC,
      eccentricity: seed.eccentricity,
      inclinationDeg: seed.inclinationDeg,
      ascendingNodeDeg: 0,
      argPeriapsisDeg: 0,
      meanAnomalyDeg: meanAnomalyDeg(TRANSIT_TRUE_ANOMALY_RAD, seed.eccentricity),
      meanMotionDegPerDay: 360 / seed.periodDays,
      nodeRateDegPerDay: 0,
      poleRaDeg: host.raDeg,
      poleDecDeg: host.decDeg,
      color: EXOPLANET_TRAIL,
    }),
  };
}
