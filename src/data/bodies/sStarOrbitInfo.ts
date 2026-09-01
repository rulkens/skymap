/**
 * sStarOrbitInfo — an S-star's InfoCard orbital rows, keyed by body id.
 *
 * Derived, never transcribed: pericentre is a(1 − e) and the pericentre speed
 * follows from a, e and P alone, so `sStarElements` keeps one column per
 * PUBLISHED quantity and gains no fourth. The semi-major axis is read back out
 * of `sStar`'s own elements rather than re-multiplying by 8178 AU per arcsecond
 * — that conversion is the maker's, so the AU figure the card prints is by
 * construction the axis the orbit is drawn with.
 */

import { pericentreSpeedKmS } from '../../utils/orbit/pericentreSpeedKmS';
import { schwarzschildRadiusM } from '../../utils/physics/schwarzschildRadiusM';
import { SCALE_UNITS } from '../scaleUnits';
import { sStar } from './makers/sStar';
import { SGR_A_STAR } from './sceneSgrAStar';
import { SGR_A_STAR_MASS_SOLAR } from './sgrAStarMassSolar';
import { S_STAR_SEEDS } from './sStarElements';
import type { BodyOrbitInfo } from '../../@types/engine/BodyOrbitInfo';

const SCHWARZSCHILD_RADIUS_AU =
  (schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR) * SCALE_UNITS.M_TO_MPC) / SCALE_UNITS.AU_TO_MPC;

const S_STAR_ORBIT_INFO: ReadonlyMap<string, BodyOrbitInfo> = new Map(
  S_STAR_SEEDS.map((seed): [string, BodyOrbitInfo] => {
    const semiMajorAu = sStar(seed).semiMajorMpc / SCALE_UNITS.AU_TO_MPC;
    const pericentreAu = semiMajorAu * (1 - seed.eccentricity);
    return [
      seed.id,
      {
        focusLabel: SGR_A_STAR.label,
        periodYr: seed.periodYr,
        eccentricity: seed.eccentricity,
        pericentreAu,
        pericentreSchwarzschildRadii: pericentreAu / SCHWARZSCHILD_RADIUS_AU,
        pericentreSpeedKmS: pericentreSpeedKmS(semiMajorAu, seed.eccentricity, seed.periodYr),
      },
    ];
  }),
);

export function sStarOrbitInfo(bodyId: string): BodyOrbitInfo | undefined {
  return S_STAR_ORBIT_INFO.get(bodyId);
}
