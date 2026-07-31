/**
 * sStar — one transcribed Gillessen+ 2017 line (`sStarElements.ts`) → canonical
 * `OrbitalElements`, and the one site of this feature's unit/frame conversions.
 *
 * BOTH sky angles convert — `Ω_frame = 90° − Ω` AND `i_frame = 180° − i`; ω
 * alone passes through, which is what makes dropping the i flip look internally
 * consistent while mirroring all 39 orbits with every invariant intact.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { degToRad } from '../../../utils/math/degToRad';
import { meanAnomalyAtJ2000 } from '../../../utils/orbit/meanAnomalyAtJ2000';
import { skyInclinationToFrameInclination } from '../../../utils/orbit/skyInclinationToFrameInclination';
import { skyPositionAngleToFrameAngle } from '../../../utils/orbit/skyPositionAngleToFrameAngle';
import { planeFrameFromPole } from '../orbitPlaneFrames';
import { sStarAppearance } from '../sStarAppearance';
import { temperatureToLinearRgb } from '../../../utils/color/temperatureToLinearRgb';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { OrbitPlaneFrame } from '../../../@types/scene/OrbitPlaneFrame';
import type { SStarSeed } from '../../../@types/scene/SStarSeed';
import type { Vec3 } from '../../../@types/math/Vec3';

/**
 * The plane of the sky at Sgr A*: pole = line of sight, so `xAxis` is East,
 * `yAxis` North, `normal` away from the observer. It lives here, not beside the
 * ecliptic/planet frames, because it is one catalogue's frame with one consumer.
 */
export const GALACTIC_CENTRE_SKY_FRAME: OrbitPlaneFrame = planeFrameFromPole(266.41684, -29.00781);

// 1″ subtends D AU at D parsecs (the parsec's definition), so 8178 AU at R₀.
const GC_R0_PC = 8178;
const GC_ARCSEC_TO_MPC = GC_R0_PC * SCALE_UNITS.AU_TO_MPC;

const YEARS_PER_JULIAN_CENTURY = 100;

/**
 * The trail carries its own star's blackbody hue, the way `palette.ts` says a
 * star's colour is derived rather than bucketed. Seven distinct tints fall out
 * of `sStarAppearance`'s bins: the seven late-type giants read orange and the
 * two unclassified rows near-white against the early population's blue.
 *
 * Scaled because `temperatureToLinearRgb` pins the brightest channel to 1.0 —
 * that is a pure hue, and the additive HDR trail draw needs the palette's
 * ≲ 0.5 ceiling or it blows out.
 */
const S_STAR_TRAIL_LEVEL = 0.5;

function sStarTrailTint(row: SStarSeed): Vec3 {
  const { temperatureK } = sStarAppearance(row.kMag, row.spectralClass);
  const [r, g, b] = temperatureToLinearRgb(temperatureK);
  return [r * S_STAR_TRAIL_LEVEL, g * S_STAR_TRAIL_LEVEL, b * S_STAR_TRAIL_LEVEL];
}

export function sStar(row: SStarSeed): OrbitalElements {
  return {
    id: row.id,
    focusId: 'sgr-a-star',
    semiMajorMpc: row.semiMajorArcsec * GC_ARCSEC_TO_MPC,
    eccentricity: row.eccentricity,
    inclinationRad: skyInclinationToFrameInclination(row.inclinationDeg),
    ascendingNodeRad: skyPositionAngleToFrameAngle(row.ascendingNodeDeg),
    argPeriapsisRad: degToRad(row.argPeriapsisDeg),
    meanAnomalyRad: meanAnomalyAtJ2000(row.periapsisEpochYr, row.periodYr),
    meanAnomalyRateRadPerCty: (2 * Math.PI * YEARS_PER_JULIAN_CENTURY) / row.periodYr,
    color: sStarTrailTint(row),
    plane: GALACTIC_CENTRE_SKY_FRAME,
  };
}
