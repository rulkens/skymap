/**
 * filamentsPass — cosmic-web skeleton from the optional `npm run build-filaments`
 * pipeline (DisPerSE → `filaments.bin`), drawn as additive screen-space ridges.
 *
 * `filaments.bin` is optional: unshipped, the renderer holds no cloud and its
 * own `draw` early-returns, so the toggle is a no-op rather than an error path.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FilamentsRuntime } from '../@types/FilamentsRuntime';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';
import { FILAMENT_LINE_HALFWIDTH_PX } from '../../../data/filament/filamentLineHalfwidthPx';
import { FILAMENT_BASE_TINT } from '../../../data/filament/filamentBaseTint';
import { FILAMENT_HOT_TINT } from '../../../data/filament/filamentHotTint';

export function filamentsPass(runtime: FilamentsRuntime): ContentPass {
  return {
    name: 'filaments',

    enabled(state, ctx, _view) {
      // Either-or on purpose: the setting is intent, opacity is the visual state,
      // so a fade-out keeps drawing after the toggle flips off until it hits 0.
      if (state.settings.filaments.enabled) return true;
      return state.subsystems.fades.opacityOf({ kind: 'filament' }, ctx.snapshot.nowMs) > 0;
    },

    draw(pass, view, ctx, state) {
      runtime.renderer.draw(
        pass,
        view.vp,
        view.viewportPx,
        ctx.drawPxPerRad,
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
}
