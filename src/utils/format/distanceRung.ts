/**
 * The distance ladder: the unit an Mpc distance reads best in, so the number stays between 1 and
 * 1000 from the observable universe down to a planet's surface:
 *
 *     Gpc · Mpc · kpc · pc   (parsec family, ≥ 1 pc; carries its light-year decade)
 *     AU                     (solar-system scale, 1 AU … 1 pc)
 *     km · m                 (planetary surface and ground level)
 *
 * Shared by `formatDistance` (with the light-year half) and the clip studio (without it).
 */
import { SCALE_UNITS } from '../../data/scaleUnits';
import type { DistanceRung } from '../../@types/utils/DistanceRung';

export function distanceRung(mpc: number): DistanceRung {
  if (mpc >= 1000) return { value: mpc / 1000, unit: 'Gpc', lyUnit: 'Gly' };
  if (mpc >= 1) return { value: mpc, unit: 'Mpc', lyUnit: 'Mly' };
  if (mpc >= SCALE_UNITS.KPC_TO_MPC) {
    return { value: mpc / SCALE_UNITS.KPC_TO_MPC, unit: 'kpc', lyUnit: 'kly' };
  }
  if (mpc >= SCALE_UNITS.PC_TO_MPC) {
    return { value: mpc / SCALE_UNITS.PC_TO_MPC, unit: 'pc', lyUnit: 'ly' };
  }
  if (mpc >= SCALE_UNITS.AU_TO_MPC) return { value: mpc / SCALE_UNITS.AU_TO_MPC, unit: 'AU' };
  if (mpc >= SCALE_UNITS.KM_TO_MPC) return { value: mpc / SCALE_UNITS.KM_TO_MPC, unit: 'km' };
  // No M_TO_MPC rung constant: metres is a leaf unit, not reused elsewhere.
  return { value: (mpc / SCALE_UNITS.KM_TO_MPC) * 1000, unit: 'm' };
}
