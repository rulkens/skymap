/**
 * BODY_FOCUS — the focus facts every discrete near-field object shares (planets, moons, craft,
 * Earth scenes, stars, satellites): you flew there to look at it, so its diameter fills 40% of
 * the screen height, dominant with sky margin, and the NEAR0 ring hugs its footprint.
 */

import type { SelectionFocus } from '../../@types/engine/layer/SelectionFocus';

export const BODY_FOCUS: SelectionFocus = {
  arrivalSize: 0.4,
  flyInto: false,
  ring: { radii: 1, slab: 'near0' },
};
