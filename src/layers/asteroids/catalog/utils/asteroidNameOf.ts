import type { AsteroidNames } from '../@types/AsteroidNames';
import { asteroidNameAt } from './asteroidNameAt';

/** asteroidNameOf — minor planet `number`'s name, or null when it has none: a binary search of `numbers`. */
export function asteroidNameOf(names: AsteroidNames, number: number): string | null {
  let lo = 0;
  let hi = names.numbers.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const at = names.numbers[mid]!;
    if (at === number) return asteroidNameAt(names, mid);
    if (at < number) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
