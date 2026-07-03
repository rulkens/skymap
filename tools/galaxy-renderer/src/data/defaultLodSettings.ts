/**
 * DEFAULT_LOD_SETTINGS — the spike's boot LOD thresholds
 * (`Galaxy Renderer.dc.html:476`). Plan 03's render-settings store slice
 * seeds from this same constant.
 */

import type { LodSettings } from '../../@types/engine/LodSettings';

export const DEFAULT_LOD_SETTINGS: LodSettings = {
  lodApparent: 0.006,
  cullBright: 0,
};
