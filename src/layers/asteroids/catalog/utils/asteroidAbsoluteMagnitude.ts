import type { AsteroidCatalog } from '../@types/AsteroidCatalog';
import { ASTEROID_FORMAT as F } from '../../../../data/asteroids/asteroidFormat';

/** Row k's H, or null where MPC gives none (the stored `hNone`). */
export function asteroidAbsoluteMagnitude(catalog: AsteroidCatalog, k: number): number | null {
  const stored = catalog.hCenti[k]!;
  return stored === F.hNone ? null : stored / F.hScale - F.hOffset;
}
