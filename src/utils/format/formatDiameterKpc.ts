/**
 * Format a galaxy diameter in kiloparsecs alongside its kilo-light-year
 * equivalent.  The InfoCard's diameter row is the canonical caller; we
 * pin to kpc rather than auto-switching to pc/Mpc because galaxy
 * diameters in this catalog never leave the kpc range (~0.5 kpc dwarfs
 * up to ~150 kpc giants).
 *
 * The dual parsec/light-year format mirrors `formatDistance`: a
 * parsec-fluent astronomer gets the precise number while a layperson
 * anchors it against the more familiar light-year.
 *
 * @param kpc  Diameter in kiloparsecs. Must be non-negative.
 */

import { PC_TO_LY } from '../math/constants';
import { formatScalar } from './formatScalar';

export function formatDiameterKpc(kpc: number): string {
  const kly = kpc * PC_TO_LY;
  return `${formatScalar(kpc)} kpc / ${formatScalar(kly)} kly`;
}
