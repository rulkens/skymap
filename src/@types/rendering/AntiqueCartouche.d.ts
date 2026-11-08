/**
 * AntiqueCartouche — one title frame design: its atlas sprite, where it sits
 * when the plate is free, and its washes (`pigments.wesl` indices; the accent
 * where the atlas marks one, the scrollwork's outer scrolls).
 */

import type { AntiqueCartoucheDesign } from './AntiqueCartoucheDesign';
import type { AntiqueSheetAnchor } from './AntiqueSheetAnchor';

export type AntiqueCartouche = {
  readonly sprite: AntiqueCartoucheDesign;
  readonly anchor: AntiqueSheetAnchor;
  readonly pigment: number;
  readonly accent: number;
};
