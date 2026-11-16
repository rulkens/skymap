import type { AsteroidNames } from '../@types/AsteroidNames';
import { countAtOrBefore } from '../../../../utils/math/countAtOrBefore';
import { asteroidNameAt } from './asteroidNameAt';

/** asteroidNameOf — minor planet `number`'s name, or null when it has none: a binary search of `numbers`. */
export function asteroidNameOf(names: AsteroidNames, number: number): string | null {
  const j = countAtOrBefore(names.numbers, number) - 1;
  return j >= 0 && names.numbers[j] === number ? asteroidNameAt(names, j) : null;
}
