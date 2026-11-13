import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_FORMAT } from '../../../../data/asteroids/asteroidFormat';
import { ASTEROID_HIDDEN_FLAG } from '../data/asteroidHiddenFlag';

/**
 * Each class's stored H over the rows that can draw (hidden ones left out), ascending, so the faintest
 * H a brightness budget keeps is one index away (`asteroidHLimitCenti`); a row with no H sorts last.
 */
export function sortedHCentiByClass(
  hCenti: Uint16Array,
  flags: Uint8Array,
): Readonly<Record<AsteroidClass, Uint16Array>> {
  const last = ASTEROID_CLASSES.length - 1;
  const codeOf = (k: number): number => Math.min(flags[k]! & ASTEROID_FORMAT.flagClassMask, last);
  const counts = new Array<number>(ASTEROID_CLASSES.length).fill(0);
  for (let k = 0; k < hCenti.length; k++) {
    if (!(flags[k]! & ASTEROID_HIDDEN_FLAG)) counts[codeOf(k)]!++;
  }
  const columns = counts.map((n) => new Uint16Array(n));
  const filled = counts.map(() => 0);
  for (let k = 0; k < hCenti.length; k++) {
    if (flags[k]! & ASTEROID_HIDDEN_FLAG) continue;
    const code = codeOf(k);
    columns[code]![filled[code]!++] = hCenti[k]!;
  }
  return Object.fromEntries(
    ASTEROID_CLASSES.map((cls, code) => [cls, columns[code]!.sort()]),
  ) as Record<AsteroidClass, Uint16Array>;
}
