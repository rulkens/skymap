/**
 * How a satellite dot looks: half-extent in px (the Gaussian is ~2 px across) and its linear HDR
 * colour, a cool white that reads against both the night side and the day side of Earth. Tuned by
 * eye; one style for every class until the class toggles (spec §7 step 3).
 */
export const SATELLITE_POINT_STYLE = {
  radiusPx: 2,
  color: [0.55, 0.62, 0.7],
} as const;
