import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import { asteroidWindowFade } from './asteroidWindowFade';

/**
 * Whether any dot can show this frame: some class faded in and the sim time inside the window. The
 * Kepler compute and the dot pass share it, so the solve runs exactly on the frames that draw.
 */
export function asteroidsDrawn(
  fade: Readonly<Record<AsteroidClass, number>>,
  simJd: number,
): boolean {
  return Object.values(fade).some((v) => v > 0) && asteroidWindowFade(simJd) > 0;
}
