import type { AsteroidBeltRamp } from '../../@types/AsteroidBeltRamp';

/**
 * The main belt's ends under colour by semi-major axis, near unit luminance like the class tints: the
 * inner belt warm (S-types dominate it), the outer cool (C-types), so the Kirkwood gaps read as seams.
 */
export const ASTEROID_BELT_RAMP: AsteroidBeltRamp = {
  inner: [1.35, 0.92, 0.7],
  outer: [0.8, 1.02, 1.37],
};
