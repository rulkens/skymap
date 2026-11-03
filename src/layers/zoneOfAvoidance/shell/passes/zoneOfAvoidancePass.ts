/**
 * zoneOfAvoidancePass — the producer half of the ZoA guide band: ray-marches
 * the shell into the reduced-res `zoa` offscreen, which
 * `zoneOfAvoidanceUpsamplePass` composites into HDR. Both read the handed value, so
 * producer and consumer can't disagree.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../../@types/ZoneOfAvoidanceRuntime';
import { ZONE_OF_AVOIDANCE_SHELL } from '../data/zoneOfAvoidanceShell';

export function zoneOfAvoidancePass(
  runtime: ZoneOfAvoidanceRuntime,
): ContentPass<'zoneOfAvoidance'> {
  return {
    name: 'zone-of-avoidance',
    fade: 'zoneOfAvoidance',
    enabled: () => true,

    // `view` unused: the 'zoa' target is a downsample of the canvas, so its
    // rays are the canvas frustum's (`ctx.frustum`), not the SlabView's vp.
    draw(pass, _view, ctx, state, fade) {
      runtime.renderer.draw(
        pass,
        ctx.cam,
        ctx.frustum,
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        fade,
      );
    },

    // No `pickEnabled`: the band's pick set equals its draw set, so the pick
    // program falls back to `enabled` above. The pick rays are the canvas
    // frustum's too, and the pick target covers `view.window` of that canvas.
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
