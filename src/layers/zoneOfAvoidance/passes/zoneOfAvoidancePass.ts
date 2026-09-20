/**
 * zoneOfAvoidancePass — the producer half of the ZoA guide band: ray-marches
 * the shell into the reduced-res `zoa` offscreen, which
 * `zoneOfAvoidanceUpsamplePass` composites into HDR. Both gate on
 * `deriveZoneOfAvoidanceLiveness`, so producer and consumer can't disagree.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../types/ZoneOfAvoidanceRuntime';
import { ZONE_OF_AVOIDANCE_SHELL } from '../../../data/zoneOfAvoidance/zoneOfAvoidanceShell';
import { deriveZoneOfAvoidanceLiveness } from '../present/deriveZoneOfAvoidanceLiveness';

export function zoneOfAvoidancePass(runtime: ZoneOfAvoidanceRuntime): ContentPass {
  return {
    name: 'zone-of-avoidance',

    enabled(state, ctx, _view) {
      return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
    },

    // `view` unused: draw takes the raw OrbitCamera (`ctx.cam`) and the
    // downscaled viewport below, not the SlabView's full-canvas vp/viewportPx.
    draw(pass, _view, ctx, state) {
      // Re-derive: enabled() already proved liveness, but this keeps draw pure.
      const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
      if (opacity === null) return;

      // Viewport is the 'zoa' target's allocated size (see `sizeOf`).
      const { width: vw, height: vh } = ctx.snapshot.renderTargets.sizeOf('zoa');

      runtime.renderer.draw(
        pass,
        ctx.cam,
        [vw, vh],
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        opacity,
      );
    },

    // No `pickEnabled`: the band's pick set equals its draw set, so the pick
    // program falls back to `enabled` above. The pick pass renders at full
    // canvas resolution regardless of the 'zoa' target's downsample, so the
    // viewport here is the full `canvasSize` — not the divided one `draw` uses.
    drawPick(pass, _view, ctx, state) {
      const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
      if (opacity === null) return;

      runtime.renderer.drawPick(
        pass,
        ctx.cam,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        state.settings.zoneOfAvoidance,
        ZONE_OF_AVOIDANCE_SHELL,
        opacity,
      );
    },
  };
}
