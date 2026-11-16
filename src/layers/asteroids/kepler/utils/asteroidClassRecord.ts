import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';

/** One value per asteroid class, the shape the per-class uniform lanes are written from. */
export function asteroidClassRecord<T>(of: (cls: AsteroidClass) => T): Record<AsteroidClass, T> {
  return Object.fromEntries(ASTEROID_CLASSES.map((cls) => [cls, of(cls)])) as Record<
    AsteroidClass,
    T
  >;
}
