import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidCatalog } from '../@types/AsteroidCatalog';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_FORMAT } from '../../../../data/asteroids/asteroidFormat';

/** Row k's class from its flags byte, clamped like the dot shader's `min(code, LAST_CLASS)`. */
export function asteroidClassOf(catalog: AsteroidCatalog, k: number): AsteroidClass {
  const code = catalog.flags[k]! & ASTEROID_FORMAT.flagClassMask;
  return ASTEROID_CLASSES[Math.min(code, ASTEROID_CLASSES.length - 1)]!;
}
