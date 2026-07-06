/**
 * barLengthOf — the single home of a barred galaxy's bar-length formula:
 * `outerRadius * 0.42 * (barStrength ?? 1)` for the `'barred'` category, and
 * exactly 0 for every other category. The length is RNG-free (only the bar's
 * tilt angle draws — see `computeBarGeometry`), so it is a pure function of
 * geometry. It was duplicated between `computeBarGeometry` (which packs the
 * value into the generation UBO) and `carveDustLayout` (which gates the
 * barDust population on `> 0`); routing both through here keeps the two from
 * drifting.
 */
import type { GalaxyCategory } from '../../@types/model/GalaxyCategory';

export function barLengthOf(
  category: GalaxyCategory,
  outerRadius: number,
  barStrength: number | undefined,
): number {
  return category === 'barred' ? outerRadius * 0.42 * (barStrength ?? 1) : 0;
}
