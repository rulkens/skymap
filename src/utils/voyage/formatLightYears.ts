/** formatLightYears — a distance in light-years on the app's ly / kly / Mly ladder ("1.27 Mly", "0.969 ly"). */

import { formatScalar } from '../format/formatScalar';

export function formatLightYears(ly: number): string {
  if (ly >= 1e6) return `${formatScalar(ly / 1e6)} Mly`;
  if (ly >= 1e3) return `${formatScalar(ly / 1e3)} kly`;
  return `${formatScalar(ly)} ly`;
}
