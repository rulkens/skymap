/**
 * filamentsPass — cosmic-web skeleton from the optional `npm run build-filaments`
 * pipeline (DisPerSE → `filaments.bin`), drawn as additive screen-space ridges.
 *
 * `filaments.bin` is optional: unshipped, the renderer holds no cloud and its
 * own `draw` early-returns, so the toggle is a no-op rather than an error path.
 * `print` makes the antique look's twin (`ANTIQUE_ONLY_PASSES`, moved to its lines
 * row): its strokes composite over, so a spine grades darker without reading as a trail.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { CosmicWebFilamentsRuntime } from '../../@types/CosmicWebFilamentsRuntime';
import { FILAMENT_LINE_HALFWIDTH_PX } from '../data/filamentLineHalfwidthPx';
import { FILAMENT_BASE_TINT } from '../data/filamentBaseTint';
import { FILAMENT_HOT_TINT } from '../data/filamentHotTint';
import { FILAMENT_PRINT_INTENSITY } from '../data/filamentPrintIntensity';
import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../data/rendering/antiqueLook';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../../services/engine/presentation/emphasisOf';
import { cosmicWebFilamentsVisibility } from '../../visibility';

export function filamentsPass(
  runtime: CosmicWebFilamentsRuntime,
  print = false,
): ContentPass<'cosmicWebFilaments'> {
  const entry = visibilityEntryOf(cosmicWebFilamentsVisibility, 'cosmicWebFilaments');
  return {
    name: print ? 'cosmic-web-filaments-print' : 'cosmic-web-filaments',
    fade: 'cosmicWebFilaments',

    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      runtime.renderer.draw(
        pass,
        view.vp,
        view.viewportPx,
        ctx.drawPxPerRad,
        // CSS px; the plate's strokes are sized in its print unit instead, which scales with
        // the (device-px) window height and so with dpr already.
        FILAMENT_LINE_HALFWIDTH_PX *
          (print
            ? view.viewportPx[1] / ANTIQUE_REFERENCE_HEIGHT_CSS
            : ctx.snapshot.devicePixelRatio),
        state.settings.cosmicWebFilaments.intensity * (print ? FILAMENT_PRINT_INTENSITY : 1),
        // The print grades by overlap alone, the same in any focus.
        print ? fade : fade * emphasisOf(entry, ctx.snapshot),
        FILAMENT_BASE_TINT,
        FILAMENT_HOT_TINT,
        print,
      );
    },
  };
}
