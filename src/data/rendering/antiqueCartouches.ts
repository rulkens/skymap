/**
 * ANTIQUE_CARTOUCHES — the title frames, each in its corner as on any Amsterdam
 * plate, 56 units in from the side and the top, just inside the neatline
 * (sizes and insets at the 900-unit reference height; `fitAntiqueCartouche`
 * shrinks and moves them on a small or crowded screen). Pigments are
 * `pigments.wesl`'s: 2 gamboge, 6 yellow ochre. Each frame is one flat wash (owner: no
 * verdigris or carmine parts on the cartouches).
 */

import type { AntiqueCartouche } from '../../@types/rendering/AntiqueCartouche';
import type { AntiqueCartoucheDesign } from '../../@types/rendering/AntiqueCartoucheDesign';

export const ANTIQUE_CARTOUCHES: Readonly<Record<AntiqueCartoucheDesign, AntiqueCartouche>> = {
  scrollwork: {
    sprite: 'scrollwork',
    anchor: { corner: 'topLeft', insetUnits: [246, 259], sizeUnits: 380 },
    pigment: 2,
  },
  strapwork: {
    sprite: 'strapwork',
    anchor: { corner: 'topLeft', insetUnits: [271, 191], sizeUnits: 430 },
    pigment: 6,
  },
  tablet: {
    sprite: 'tablet',
    anchor: { corner: 'topLeft', insetUnits: [286, 157], sizeUnits: 460 },
    pigment: 2,
  },
};
