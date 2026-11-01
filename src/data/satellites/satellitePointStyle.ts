/**
 * How a satellite dot looks: half-extent in px (the Gaussian is ~2 px across) and its linear HDR
 * colour, a cool white that reads against both the night side and the day side of Earth. Tuned by
 * eye, one style for every class. The pick footprint is wider than the dot: a 2 px target is too
 * small to hit with a mouse, let alone a finger.
 */
export const SATELLITE_POINT_STYLE = {
  radiusPx: 2,
  pickRadiusPx: 8,
  color: [0.55, 0.62, 0.7],
} as const;
