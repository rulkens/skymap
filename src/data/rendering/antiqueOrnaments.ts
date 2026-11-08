/**
 * ANTIQUE_ORNAMENTS — the antique plate's decorations beside its title cartouche
 * (`ANTIQUE_CARTOUCHES`); no compass rose: a celestial chart never carried one.
 * Inside the Galaxy the beasts are constellation figures
 * over their own stars; out among the galaxies they sail the Zone of
 * Avoidance, the wedge behind the galactic plane the surveys cannot see into:
 * the one honest terra incognita on this map.
 * Pigment indices are `pigments.wesl`'s: 0 verdigris, 1 sap green, 5 smalt,
 * 6 yellow ochre. Each engraving is washed flat inside its outline, as
 * Cellarius' colourists washed his figures' robes.
 */

import type { AntiqueOrnament } from '../../@types/rendering/AntiqueOrnament';

const beast = (
  sprite: string,
  regime: 'stars' | 'cosmos',
  lonDeg: number,
  latDeg: number,
  sizeDeg: number,
  pigment: number,
  mirrored = false,
): AntiqueOrnament => ({
  sprite,
  anchor: { kind: 'sky', lonDeg, latDeg, sizeDeg },
  regime,
  facesNorth: true,
  pigment,
  opacity: 1,
  clearsBeneath: false,
  mirrored,
});

const voyager = (
  sprite: string,
  lonDeg: number,
  distMpc: number,
  sizeMpc: number,
  pigment: number,
): AntiqueOrnament => ({
  ...beast(sprite, 'cosmos', lonDeg, 0, 0, pigment),
  anchor: { kind: 'space', lonDeg, latDeg: 0, distMpc, sizeMpc },
  // Not a constellation figure: it sails empty sea, so no glyph prints through it.
  clearsBeneath: true,
});

export const ANTIQUE_ORNAMENTS: readonly AntiqueOrnament[] = [
  // Hevelius' constellation figures (1690) at each figure's centre (J2000 RA/Dec,
  // degrees). He drew them as seen from outside the globe, so a sky-view plate
  // mirrors them.
  beast('cetus', 'stars', 25, -8, 36, 5, true),
  beast('dragon', 'stars', 255, 64, 34, 1, true),
  beast('seaSerpent', 'stars', 150, -18, 44, 0, true),
  // Places in the Zone of Avoidance: galactic longitude, distance, size (Mpc).
  voyager('seaMonster', 60, 30, 18, 0),
  voyager('whale', 150, 45, 22, 5),
  voyager('seaHorse', 240, 35, 16, 1),
  voyager('ship', 320, 25, 7, 6),
];
