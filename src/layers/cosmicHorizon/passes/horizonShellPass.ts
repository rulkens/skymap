/**
 * horizonShellPass — the analytic horizon sphere, ray-marched over the full screen.
 * Core hands the toggle fade times the entry's reach band and skips the pass at 0, so a
 * faded-out shell costs no render pass instead of ray-marching every pixel to transparent.
 * Drawn after the cosmic-web volumes (they composite over it) and before the cluster
 * markers (their rings stay on top). The renderer reads `ctx.cam`, not `view.vp`: it
 * builds per-pixel view rays from the camera basis and FOV, transforming no vertices.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { CosmicHorizonRuntime } from '../@types/CosmicHorizonRuntime';

export function horizonShellPass(runtime: CosmicHorizonRuntime): ContentPass<'cosmicHorizon'> {
  return {
    name: 'horizon-shell',
    fade: 'cosmicHorizon',

    enabled: () => true,

    draw(pass, view, ctx, _state, fade) {
      runtime.renderer.draw(pass, ctx.cam, view.viewportPx, fade);
    },
  };
}
