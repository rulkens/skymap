/**
 * sStar — one transcribed Gillessen+ 2017 line (`sStarElements.ts`) → canonical
 * `OrbitalElements`: this table's units (arcsec at R₀) and trail tint; the sky
 * angles convert in `skyOrbitElements`, shared with the visual binaries.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { planeFrameFromPole } from '../orbitPlaneFrames';
import { skyOrbitElements } from './skyOrbitElements';
import { GALACTIC_CENTRE_ANCHOR } from '../../places/galacticCentre';
import { sStarAppearance } from '../sStarAppearance';
import { starTrailTint } from '../../../utils/color/starTrailTint';
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

/**
 * The trail carries its own star's blackbody hue, the way `palette.ts` says a
 * star's colour is derived rather than bucketed. Seven distinct tints fall out
 * of `sStarAppearance`'s bins: the seven late-type giants read orange and the
 * two unclassified rows near-white against the early population's blue.
 */
function sStarTrailTint(row: SStarSeed): Vec3 {
  return starTrailTint(sStarAppearance(row.kMag, row.spectralClass).temperatureK);
}

export function sStar(row: SStarSeed): OrbitalElements {
  return skyOrbitElements({
    id: row.id,
    focusId: GALACTIC_CENTRE_ANCHOR.id,
    plane: GALACTIC_CENTRE_SKY_FRAME,
    semiMajorMpc: row.semiMajorArcsec * GC_ARCSEC_TO_MPC,
    eccentricity: row.eccentricity,
    inclinationDeg: row.inclinationDeg,
    ascendingNodeDeg: row.ascendingNodeDeg,
    argPeriapsisDeg: row.argPeriapsisDeg,
    periapsisEpochYr: row.periapsisEpochYr,
    periodYr: row.periodYr,
    color: sStarTrailTint(row),
  });
}
