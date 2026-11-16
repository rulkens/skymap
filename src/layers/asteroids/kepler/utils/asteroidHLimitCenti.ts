import { ASTEROID_FORMAT } from '../../../../data/asteroids/asteroidFormat';

/**
 * The faintest stored H (`hCenti`) that keeps `fraction` of a class's rows, from its ascending H
 * column; ties at the limit all stay. At a fraction of 1 every row stays, the no-H ones included.
 */
export function asteroidHLimitCenti(sortedHCenti: Uint16Array, fraction: number): number {
  if (fraction >= 1 || sortedHCenti.length === 0) return ASTEROID_FORMAT.hNone;
  return sortedHCenti[Math.max(0, Math.ceil(fraction * sortedHCenti.length) - 1)]!;
}
