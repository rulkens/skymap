import { ASTEROID_FORMAT as F } from '../../../../data/asteroids/asteroidFormat';

/** H in the catalog's stored units (`hCenti`, unrounded): `asteroidAbsoluteMagnitude`'s inverse. */
export function asteroidHCenti(h: number): number {
  return (h + F.hOffset) * F.hScale;
}
