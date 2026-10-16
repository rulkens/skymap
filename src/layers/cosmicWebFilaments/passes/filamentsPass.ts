/**
 * filamentsPass — cosmic-web skeleton from the optional `npm run build-filaments`
 * pipeline (DisPerSE → `filaments.bin`), drawn as additive screen-space ridges.
 *
 * `filaments.bin` is optional: unshipped, the renderer holds no cloud and its
 * own `draw` early-returns, so the toggle is a no-op rather than an error path.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { CosmicWebFilamentsRuntime } from '../@types/CosmicWebFilamentsRuntime';
import { FILAMENT_LINE_HALFWIDTH_PX } from '../../../data/filament/filamentLineHalfwidthPx';
import { FILAMENT_BASE_TINT } from '../../../data/filament/filamentBaseTint';
import { FILAMENT_HOT_TINT } from '../../../data/filament/filamentHotTint';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { cosmicWebFilamentsVisibility } from '../visibility';

export function filamentsPass(
  runtime: CosmicWebFilamentsRuntime,
): ContentPass<'cosmicWebFilaments'> {
  const entry = visibilityEntryOf(cosmicWebFilamentsVisibility, 'cosmicWebFilaments');
  return {
    name: 'cosmic-web-filaments',
    fade: 'cosmicWebFilaments',

    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      runtime.renderer.draw(
        pass,
        view.vp,
        view.viewportPx,
        ctx.drawPxPerRad,
        FILAMENT_LINE_HALFWIDTH_PX,
        state.settings.cosmicWebFilaments.intensity,
        fade * emphasisOf(entry, ctx.snapshot),
        FILAMENT_BASE_TINT,
        FILAMENT_HOT_TINT,
      );
    },
  };
}
