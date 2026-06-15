/**
 * Format a distance in megaparsecs (Mpc) with adaptive units, paired
 * with a matching light-year value.
 *
 * A single helper lives here rather than inline at each call site because
 * it is needed in two independent places — the engine's scale-bar
 * computation and the InfoCard's distance display — and duplicating it
 * would risk the two drifting apart.
 *
 * Switches to kpc below 1 Mpc and Gpc above 1000 Mpc so the displayed
 * value is always between 1 and 1000 (with adaptive units), making the
 * scale bar and info-card distance fields easy to read at any zoom
 * level.  The light-year conversion uses the same decade so the two
 * sides of the slash agree — kpc↔kly, Mpc↔Mly, Gpc↔Gly — rather than
 * forcing readers to mentally re-scale across different unit decades.
 *
 * Parsecs are the working unit of cosmology but not of casual readers;
 * the dual format ("100 Mpc / 326 Mly") gives a parsec-fluent astronomer
 * the precise number while letting a layperson anchor it against the more
 * familiar light-year.  The slash separator is intentional: " · " is
 * already used between different facts (distance · velocity), so reusing
 * it would conflate "alternate unit for the same distance" with "another
 * fact".
 *
 * @param mpc  Distance in megaparsecs. Must be non-negative.
 */

import { PC_TO_LY } from '../math/constants';
import { formatScalar } from './formatScalar';

export function formatDistance(mpc: number): string {
  if (mpc < 1) {
    const kpc = mpc * 1000;
    const kly = kpc * PC_TO_LY;
    return `${formatScalar(kpc)} kpc / ${formatScalar(kly)} kly`;
  }
  if (mpc >= 1000) {
    const gpc = mpc / 1000;
    const gly = gpc * PC_TO_LY;
    return `${formatScalar(gpc)} Gpc / ${formatScalar(gly)} Gly`;
  }
  const mly = mpc * PC_TO_LY;
  return `${formatScalar(mpc)} Mpc / ${formatScalar(mly)} Mly`;
}
