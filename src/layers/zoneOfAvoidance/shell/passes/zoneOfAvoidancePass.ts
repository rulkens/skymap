/**
 * zoneOfAvoidancePass — the producer half of the ZoA guide band: ray-marches
 * the shell into the reduced-res `zoa` offscreen, which
 * `zoneOfAvoidanceUpsamplePass` composites into HDR. Both read the handed value, so
 * producer and consumer can't disagree. Under a focus the band recedes like the other guides
 * and takes no pick: a sky band has no position for the focus sphere to test.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../../@types/ZoneOfAvoidanceRuntime';
import { ZONE_OF_AVOIDANCE_SHELL } from '../data/zoneOfAvoidanceShell';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../../services/engine/presentation/emphasisOf';
import { zoneOfAvoidanceVisibility } from '../../visibility';

export function zoneOfAvoidancePass(
  runtime: ZoneOfAvoidanceRuntime,
): ContentPass<'zoneOfAvoidance'> {
  const entry = visibilityEntryOf(zoneOfAvoidanceVisibility, 'zoneOfAvoidance');
  return {
    name: 'zone-of-avoidance',
    fade: 'zoneOfAvoidance',
    enabled: () => true,
    pickEnabled: (_state, ctx) => ctx.snapshot.focusBlend === 0,

    // `view` unused: the 'zoa' target is a downsample of the canvas, so its
    // rays are the canvas frustum's (`ctx.frustum`), not the SlabView's vp.
    draw(pass, _view, ctx, state, fade) {
      runtime.renderer.draw(
        pass,
        ctx.cam,
        ctx.frustum,
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        fade * emphasisOf(entry, ctx.snapshot),
      );
    },

    // The pick rays are the canvas frustum's too, and the pick target covers
    // `view.window` of that canvas.
    drawPick(pass, view, ctx, state, fade) {
      runtime.renderer.drawPick(
        pass,
        ctx.cam,
        ctx.frustum,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        view.window,
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        fade,
      );
    },
  };
}
