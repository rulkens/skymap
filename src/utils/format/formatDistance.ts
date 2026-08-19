/**
 * Format a distance in megaparsecs (Mpc) with adaptive units, paired
 * with a matching light-year value.
 *
 * A single helper lives here rather than inline at each call site because
 * it is needed in two independent places — the engine's scale-bar
 * computation and the InfoCard's distance display — and duplicating it
 * would risk the two drifting apart.
 *
 * Steps through a unit ladder so the displayed value stays between 1 and
 * 1000 (with adaptive units), making the scale bar and info-card distance
 * fields easy to read at every zoom level — from the whole observable
 * universe down to a planetary surface:
 *
 *     Gpc · Mpc · kpc · pc   (parsec family, ≥ 1 pc)
 *     AU                     (solar-system scale, 1 AU … 1 pc)
 *     km                     (planetary surface, 1 km … 1 AU)
 *     m                      (ground level, < 1 km)
 *
 * In the parsec family the light-year conversion uses the same decade so
 * the two sides of the slash agree — pc↔ly, kpc↔kly, Mpc↔Mly, Gpc↔Gly —
 * rather than forcing readers to mentally re-scale across unit decades.
 * Parsecs are the working unit of cosmology but not of casual readers;
 * the dual format ("100 Mpc / 326 Mly") gives a parsec-fluent astronomer
 * the precise number while letting a layperson anchor it against the more
 * familiar light-year.  The slash separator is intentional: " · " is
 * already used between different facts (distance · velocity), so reusing
 * it would conflate "alternate unit for the same distance" with "another
 * fact".
 *
 * Below a parsec the light-year companion stops helping — a fraction of a
 * light-year is no more intuitive than a fraction of a parsec — so the AU
 * and km bands drop the slash and show a single, scale-appropriate unit.
 * AU is the natural ruler across the solar system; km takes over once the
 * camera is closer than an astronomical unit (near a planet's surface).
 *
 * @param mpc  Distance in megaparsecs. Must be non-negative.
 */

import { PC_TO_LY } from '../math/constants';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { formatScalar } from './formatScalar';

export function formatDistance(mpc: number): string {
  if (mpc >= 1000) {
    const gpc = mpc / 1000;
    return `${formatScalar(gpc)} Gpc / ${formatScalar(gpc * PC_TO_LY)} Gly`;
  }
  if (mpc >= 1) {
    return `${formatScalar(mpc)} Mpc / ${formatScalar(mpc * PC_TO_LY)} Mly`;
  }
  if (mpc >= SCALE_UNITS.KPC_TO_MPC) {
    const kpc = mpc / SCALE_UNITS.KPC_TO_MPC;
    return `${formatScalar(kpc)} kpc / ${formatScalar(kpc * PC_TO_LY)} kly`;
  }
  if (mpc >= SCALE_UNITS.PC_TO_MPC) {
    const pc = mpc / SCALE_UNITS.PC_TO_MPC;
    return `${formatScalar(pc)} pc / ${formatScalar(pc * PC_TO_LY)} ly`;
  }
  if (mpc >= SCALE_UNITS.AU_TO_MPC) {
    return `${formatScalar(mpc / SCALE_UNITS.AU_TO_MPC)} AU`;
  }
  if (mpc >= SCALE_UNITS.KM_TO_MPC) {
    return `${formatScalar(mpc / SCALE_UNITS.KM_TO_MPC)} km`;
  }
  // No M_TO_MPC constant: metres is a leaf unit, not reused elsewhere.
  return `${formatScalar((mpc / SCALE_UNITS.KM_TO_MPC) * 1000)} m`;
}
