import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { ASTEROID_INNER_FADES as INNER } from '../../points/data/asteroidFades';
import { asteroidSunFromCamAu } from './asteroidSunFromCamAu';

/**
 * The Layer's class fade with the per-class distance fade folded in. The visibility band is wide
 * enough for `distant`; every other class also fades out on the inner pair, by the eye's distance
 * from the Sun. Every consumer of the fade (compute, dots, orbit trail) takes this, not the raw one.
 */
export function asteroidClassFade(
  fade: Readonly<Record<AsteroidClass, number>>,
  eye: Readonly<Vec3>,
): Record<AsteroidClass, number> {
  const [x, y, z] = asteroidSunFromCamAu(eye);
  const near = 1 - smoothstep(INNER.fullWithinAu, INNER.goneBeyondAu, Math.hypot(x, y, z));
  return Object.fromEntries(
    ASTEROID_CLASSES.map((cls) => [cls, cls === 'distant' ? fade[cls] : fade[cls] * near]),
  ) as Record<AsteroidClass, number>;
}
