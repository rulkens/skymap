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

// One dim blue-white for all 39 — the table carries no colour, and per-star
// tints would not read apart here. Max channel ≲ 0.5, the `palette.ts` rule.
const S_STAR_TRAIL_TINT: Vec3 = [0.3, 0.34, 0.5];

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
    color: S_STAR_TRAIL_TINT,
    plane: GALACTIC_CENTRE_SKY_FRAME,
  };
}
