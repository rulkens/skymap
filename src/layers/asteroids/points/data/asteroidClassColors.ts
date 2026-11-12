import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Linear RGB tint per class, near unit luminance so the colour never changes how bright a dot reads.
 * The belt stays a neutral warm white; the groups it is drawn to show apart get the hues.
 */
export const ASTEROID_CLASS_COLORS: Readonly<Record<AsteroidClass, Readonly<Vec3>>> = {
  nearEarth: [1.35, 0.6, 0.45],
  mainBelt: [1.05, 1.0, 0.92],
  hilda: [1.8, 0.85, 0.2],
  jupiterTrojan: [0.35, 1.35, 0.5],
  distant: [0.6, 0.85, 1.35],
};
