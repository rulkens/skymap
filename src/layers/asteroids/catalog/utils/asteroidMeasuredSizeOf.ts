import type { AsteroidDiameters } from '../@types/AsteroidDiameters';
import type { AsteroidMeasuredSize } from '../@types/AsteroidMeasuredSize';
import { countAtOrBefore } from '../../../../utils/math/countAtOrBefore';

/** asteroidMeasuredSizeOf — minor planet `number`'s measured diameter and albedo, or null when SBDB has none. */
export function asteroidMeasuredSizeOf(
  diameters: AsteroidDiameters,
  number: number,
): AsteroidMeasuredSize | null {
  const j = countAtOrBefore(diameters.numbers, number) - 1;
  if (j < 0 || diameters.numbers[j] !== number) return null;
  const albedo = diameters.albedo[j]!;
  return { diameterKm: diameters.diameterKm[j]!, albedo: Number.isNaN(albedo) ? null : albedo };
}
