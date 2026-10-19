/** formatGamma — a Lorentz factor as the voyage writes it: plain below a thousand ("3.19"), else "1.31 × 10⁶". */

import { formatPowerOfTen } from '../format/formatPowerOfTen';
import { formatScalar } from '../format/formatScalar';

export function formatGamma(gamma: number): string {
  return gamma < 1000 ? formatScalar(gamma) : formatPowerOfTen(gamma, 3);
}
