/**
 * zoneOfAvoidancePass — the producer half of the ZoA guide band: ray-marches
 * the shell into the reduced-res `zoa` offscreen, which
 * `zoneOfAvoidanceUpsamplePass` composites into HDR. Both read the handed value, so
 * producer and consumer can't disagree.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../@types/ZoneOfAvoidanceRuntime';
import { ZONE_OF_AVOIDANCE_SHELL } from '../../../data/zoneOfAvoidance/zoneOfAvoidanceShell';

export function zoneOfAvoidancePass(
  runtime: ZoneOfAvoidanceRuntime,
): ContentPass<'zoneOfAvoidance'> {
  return {
    name: 'zone-of-avoidance',
    fade: 'zoneOfAvoidance',
    enabled: () => true,

    // `view` unused: draw takes the raw OrbitCamera (`ctx.cam`) and the
    // downscaled viewport below, not the SlabView's full-canvas vp/viewportPx.
    draw(pass, _view, ctx, state, fade) {
      // Viewport is the 'zoa' target's allocated size (see `sizeOf`).
      const { width: vw, height: vh } = ctx.snapshot.renderTargets.sizeOf('zoa');

      runtime.renderer.draw(
        pass,
        ctx.cam,
        [vw, vh],
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        fade,
      );
    },

    // No `pickEnabled`: the band's pick set equals its draw set, so the pick
    // program falls back to `enabled` above. The pick rays are the full
    // canvas's (`canvasSize`, not the 'zoa' downsample `draw` uses), and the
    // pick target covers `view.window` of that canvas.
    drawPick(pass, view, ctx, state, fade) {
      runtime.renderer.drawPick(
        pass,
        ctx.cam,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        view.window,
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        fade,
      );
    },
  };
}
