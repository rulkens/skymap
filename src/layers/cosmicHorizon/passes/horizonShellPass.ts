/**
 * horizonShellPass — the analytic horizon sphere, ray-marched over the full screen.
 * Gated in `enabled`, not only by shader alpha: a faded-out shell then skips its
 * render pass and timing slot instead of ray-marching every pixel to transparent.
 * `draw` recomputes the same fade from the frame-frozen camera, so the two agree.
 * Drawn after the cosmic-web volumes (they composite over it) and before the cluster
 * markers (their rings stay on top). The renderer reads `ctx.cam`, not `view.vp`: it
 * builds per-pixel view rays from the camera basis and FOV, transforming no vertices.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { CosmicHorizonRuntime } from '../@types/CosmicHorizonRuntime';
import { horizonShellFadeAlpha } from '../render/horizonShellFadeAlpha';
import { HORIZON_RADIUS_MPC } from '../data/horizonRadiusMpc';

export function horizonShellPass(runtime: CosmicHorizonRuntime): ContentPass {
  return {
    name: 'horizon-shell',

    enabled(_state, ctx, _view) {
      const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
      return horizonShellFadeAlpha(camDistMpc, HORIZON_RADIUS_MPC) > 0;
    },

    draw(pass, view, ctx) {
      const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
      const fadeAlpha = horizonShellFadeAlpha(camDistMpc, HORIZON_RADIUS_MPC);
      runtime.renderer.draw(pass, ctx.cam, view.viewportPx, fadeAlpha);
    },
  };
}
