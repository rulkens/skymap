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
import { ANTIQUE_FIGURE_ANCHORS } from './antiqueFigureAnchors';

// A constellation figure lies on its anchor stars; a voyager upright to celestial north.
const figure = (sprite: string, pigment: number): AntiqueOrnament => ({
  sprite,
  anchor: { kind: 'sky', stars: ANTIQUE_FIGURE_ANCHORS[sprite]! },
  regime: 'stars',
  pigment,
  opacity: 1,
  clearsBeneath: false,
});

const voyager = (
  sprite: string,
  lonDeg: number,
  distMpc: number,
  sizeMpc: number,
  pigment: number,
): AntiqueOrnament => ({
  sprite,
  anchor: { kind: 'space', lonDeg, latDeg: 0, distMpc, sizeMpc },
  regime: 'cosmos',
  pigment,
  opacity: 1,
  // Not a constellation figure: it sails empty sea, so no glyph prints through it.
  clearsBeneath: true,
});

export const ANTIQUE_ORNAMENTS: readonly AntiqueOrnament[] = [
  // Hevelius' constellation figures (1690).
  figure('cetus', 5),
  figure('dragon', 1),
  figure('seaSerpent', 0),
  // Places in the Zone of Avoidance: galactic longitude, distance, size (Mpc).
  voyager('seaMonster', 60, 30, 18, 0),
  voyager('whale', 150, 45, 22, 5),
  voyager('seaHorse', 240, 35, 16, 1),
  voyager('ship', 320, 25, 7, 6),
];
