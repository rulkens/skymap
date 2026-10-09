import type { StarFocusSphere } from '../../src/layers/starCatalog/@types/StarFocusSphere';

/** A focus sphere with nothing focused: blend 0, non-degenerate radii. */
export const STAR_FOCUS_AT_REST: StarFocusSphere = {
  centerRelCamMpc: [0, 0, 0],
  apparentRadiusMpc: 1,
  physicalRadiusMpc: 0,
  blend: 0,
};
