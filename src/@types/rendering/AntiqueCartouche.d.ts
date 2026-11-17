/**
 * AntiqueCartouche — one title frame design: its atlas sprite, where it sits
 * when the plate is free, and its wash (a `pigments.wesl` index).
 */

import type { AntiqueCartoucheDesign } from './AntiqueCartoucheDesign';
import type { AntiqueSheetAnchor } from './AntiqueSheetAnchor';

export type AntiqueCartouche = {
  readonly sprite: AntiqueCartoucheDesign;
  readonly anchor: AntiqueSheetAnchor;
  readonly pigment: number;
};
