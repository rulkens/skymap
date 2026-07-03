/**
 * DEFAULT_RENDER_SETTINGS — the spike's boot compositing knobs
 * (`Galaxy Renderer.dc.html:476`), plus the two the spike's own UI never
 * exposed a slider for (`vignette`, `starIntensity`) — those come from
 * `createGalaxyEngine`'s internal render-bag defaults instead, so this is
 * still "what the spike actually rendered on first paint," just sourced
 * from two places. Plan 03's render-settings store slice seeds from this
 * same constant.
 */

import type { RenderSettings } from '../../@types/engine/RenderSettings';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  exposure: 0.92,
  bloom: 0.85,
  saturation: 1.26,
  vignette: 0.5,
  sizeScale: 0.3,
  starIntensity: 0.11,
  tonemap: 0,
};
