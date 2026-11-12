import type { AsteroidClassColors } from '../../@types/AsteroidClassColors';

/**
 * Linear RGB tint per class, near unit luminance so the colour never changes how bright a dot reads.
 * The belt stays a neutral warm white; the groups it is drawn to show apart get the hues. The
 * Jupiter trojans take Jupiter's tan (the body palette's), nudged red; the Hildas go violet to stay apart.
 */
export const ASTEROID_CLASS_COLORS: AsteroidClassColors = {
  nearEarth: [1.35, 0.6, 0.45],
  mainBelt: [1.05, 1.0, 0.92],
  hilda: [1.3, 0.78, 1.7],
  jupiterTrojan: [1.45, 0.88, 0.42],
  distant: [0.6, 0.85, 1.35],
};
