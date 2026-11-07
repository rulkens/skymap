/**
 * ANTIQUE_EARTH_PLACE_REVEAL — when a globe name shows. The globe's diameter on
 * screen fades every name in over `globePx`; a name fades in over `fitPx` of room
 * left between its box and the globe's rim, so none overhangs the limb much; and over
 * `sunCos`, the cosine toward the Sun, so twilight keeps a name and the
 * cross-hatched night drops it. The box is estimated from each cut's mean IM Fell
 * advance (`advanceEm`, tracking added) and line height (`lineEm`), in em.
 */

export const ANTIQUE_EARTH_PLACE_REVEAL = {
  globePx: [200, 250],
  fitPx: [-8, 8],
  sunCos: [-0.35, -0.1],
  advanceEm: { capitals: 0.62, roman: 0.5, italic: 0.44 },
  lineEm: 1.2,
} as const;
