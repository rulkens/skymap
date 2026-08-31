/**
 * filamentsLayer — cosmic-web skeleton from the optional `npm run build-filaments`
 * pipeline (DisPerSE → `filaments.bin`), drawn as additive screen-space ridges.
 *
 * `filaments.bin` is optional: unshipped, `filamentRenderer` stays null and the
 * layer reads as disabled, so its toggle is a no-op rather than an error path.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { COSMO } from '../slabs';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

// Halfwidth: the shader expands each segment to a 2 × this quad, so 1.5 → ~3-px lines.
const FILAMENT_LINE_HALFWIDTH_PX = 1.5;

// Tint-ramp endpoints (RGB), mixed per-fragment by density; luminance matched on
// purpose so the sparse → dense shift reads as colour, not glare.
const FILAMENT_BASE_TINT: Vec3 = [0.55, 0.45, 0.85];
const FILAMENT_HOT_TINT: Vec3 = [0.85, 0.75, 1.0];

export const filamentsLayer: ContentLayer = {
  name: 'filaments',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx, _view) {
    // Either-or on purpose: the setting is intent, opacity is the visual state,
    // so a fade-out keeps drawing after the toggle flips off until it hits 0.
    if (state.settings.filaments.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'filament' }, ctx.nowMs) > 0;
  },

  draw(pass, view, ctx, state) {
    if (state.gpu.filamentRenderer === null) return;

    state.gpu.filamentRenderer.draw(
      pass,
      view.vp,
      view.viewportPx,
      FILAMENT_LINE_HALFWIDTH_PX,
      state.settings.filaments.intensity,
      // Focus recession is applied HERE (on the drawn opacity), not on the
      // `enabled` gate above: recession ∈ [FILAMENT_RECESSION, 1] can never
      // zero the layer, so the gate keeps reading the pure toggle opacity.
      resolveLayerOpacity(state, ctx, { kind: 'filament' }),
      FILAMENT_BASE_TINT,
      FILAMENT_HOT_TINT,
    );
  },
};
