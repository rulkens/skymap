/**
 * The size of a satellite dot: half-extent in px (the Gaussian is ~2 px across), one size for every
 * group. The pick footprint is wider than the dot: a 2 px target is too small to hit with a mouse,
 * let alone a finger.
 */
export const SATELLITE_POINT_STYLE = {
  radiusPx: 2,
  pickRadiusPx: 8,
} as const;
