/**
 * ANTIQUE_ORNAMENTS — the antique plate's decorations. Sheet rows sit where a
 * 1660s Amsterdam plate put them (title cartouche in a corner, one compass
 * rose); sky rows are the sky's own beasts. Inside the Galaxy they ride their
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
): AntiqueOrnament => ({
  id,
  sprite,
  anchor: { kind: 'sky', frame, lonDeg, latDeg, sizeDeg },
  regime,
  facesNorth: true,
  rotationDeg: 0,
  pigment,
  opacity: 0.85,
  clearsBeneath: false,
});

export const ANTIQUE_ORNAMENTS: readonly AntiqueOrnament[] = [
  {
    id: 'cartouche',
    sprite: 'cartouche',
    anchor: { kind: 'sheet', corner: 'topLeft', insetUnits: [170, 92], sizeUnits: 280 },
    regime: 'always',
    facesNorth: false,
    rotationDeg: 0,
    pigment: 2,
    opacity: 1,
    clearsBeneath: true,
  },
  {
    id: 'compass-rose',
    sprite: 'compassRose',
    anchor: { kind: 'sheet', corner: 'bottomRight', insetUnits: [110, 210], sizeUnits: 130 },
    regime: 'always',
    facesNorth: true,
    rotationDeg: 0,
    pigment: 3,
    opacity: 1,
    clearsBeneath: true,
  },
  // Constellation beasts, at each figure's centre (J2000 RA/Dec, degrees).
  beast('cetus', 'whale', 'stars', 'equatorial', 25, -8, 34, 5),
  beast('draco', 'dragon', 'stars', 'equatorial', 255, 64, 34, 1),
  beast('hydra', 'seaSerpent', 'stars', 'equatorial', 150, -18, 44, 0),
  beast('piscis-austrinus', 'seaMonster', 'stars', 'equatorial', 335, -30, 20, 6),
  // Zone of Avoidance beasts, on the galactic equator.
  beast('zoa-serpent', 'seaSerpent', 'cosmos', 'galactic', 60, 0, 30, 0),
  beast('zoa-whale', 'whale', 'cosmos', 'galactic', 150, 0, 28, 5),
  beast('zoa-dragon', 'dragon', 'cosmos', 'galactic', 240, 0, 30, 1),
  beast('zoa-monster', 'seaMonster', 'cosmos', 'galactic', 320, 0, 26, 6),
];
