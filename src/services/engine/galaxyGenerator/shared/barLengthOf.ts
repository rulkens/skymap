/**
 * barLengthOf — the single home of a barred galaxy's bar-length formula:
 * `outerRadius * 0.42 * (barStrength ?? 1)` for `'barred'`, else 0. RNG-free
 * (only the tilt angle draws — see `computeBarGeometry`). Both
 * `computeBarGeometry` and `carveDustLayout`'s `barDust > 0` gate read this,
 * not their own copy of the formula, so the two can't drift apart.
 */
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';

export function barLengthOf(
  category: GalaxyCategory,
  outerRadius: number,
  barStrength: number | undefined,
): number {
  return category === 'barred' ? outerRadius * 0.42 * (barStrength ?? 1) : 0;
}
