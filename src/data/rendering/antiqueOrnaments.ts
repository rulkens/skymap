/**
 * ANTIQUE_ORNAMENTS — the antique plate's decorations. The title cartouche sits
 * in a corner, as on any Amsterdam plate (no compass rose: a celestial chart
 * never carried one); sky rows are the sky's own beasts. Inside the Galaxy they ride their
 * constellations, as a star atlas draws Cetus or Draco. Out among the galaxies
 * they move to the Zone of Avoidance, the band behind the galactic plane where
 * the catalogs are empty: the one honest terra incognita on this map.
 * Pigment indices are `pigments.wesl`'s: 2 gamboge, 3 red lead, 5 azurite, 6 ochre.
 */

import type { AntiqueOrnament } from '../../@types/rendering/AntiqueOrnament';

const beast = (
  id: string,
  sprite: string,
  regime: 'stars' | 'cosmos',
  frame: 'equatorial' | 'galactic',
  lonDeg: number,
  latDeg: number,
  sizeDeg: number,
  pigment: number,
  mirrored = false,
): AntiqueOrnament => ({
  id,
  sprite,
  anchor: { kind: 'sky', frame, lonDeg, latDeg, sizeDeg },
  regime,
  facesNorth: true,
  rotationDeg: 0,
  pigment,
  opacity: 1,
  clearsBeneath: false,
  mirrored,
});

const voyager = (
  id: string,
  sprite: string,
  lonDeg: number,
  distMpc: number,
  sizeMpc: number,
  pigment: number,
): AntiqueOrnament => ({
  ...beast(id, sprite, 'cosmos', 'galactic', lonDeg, 0, 0, pigment),
  anchor: { kind: 'space', lonDeg, latDeg: 0, distMpc, sizeMpc },
  // Not a constellation figure: it sails empty sea, so no glyph prints through it.
  clearsBeneath: true,
});

export const ANTIQUE_ORNAMENTS: readonly AntiqueOrnament[] = [
  {
    id: 'cartouche',
    sprite: 'cartouche',
    anchor: { kind: 'sheet', corner: 'topLeft', insetUnits: [240, 178], sizeUnits: 380 },
    regime: 'always',
    facesNorth: false,
    rotationDeg: 0,
    pigment: 2,
    opacity: 1,
    clearsBeneath: true,
    mirrored: false,
  },
  // Constellation figures, at each figure's centre (J2000 RA/Dec, degrees). Only
  // beasts drawn without a sea under them: the sky has no waves.
  // Hevelius drew his figures as seen from outside the globe: a sky-view plate mirrors them.
  beast('cetus', 'cetus', 'stars', 'equatorial', 25, -8, 36, 5, true),
  beast('draco', 'dragon', 'stars', 'equatorial', 255, 64, 34, 1),
  beast('hydra', 'seaSerpent', 'stars', 'equatorial', 150, -18, 44, 0),
  // Out among the galaxies the Zone of Avoidance is a wedge of space round the
  // galactic plane that the surveys cannot see into: an uncharted ocean, where
  // the sea-chart fauna and a ship may sail, each at a place in it.
  voyager('zoa-monster', 'seaMonster', 60, 30, 18, 0),
  voyager('zoa-whale', 'whale', 150, 45, 22, 5),
  voyager('zoa-seahorse', 'seaHorse', 240, 35, 16, 1),
  voyager('zoa-ship', 'ship', 320, 25, 7, 6),
];
