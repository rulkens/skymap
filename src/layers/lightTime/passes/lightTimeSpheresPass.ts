/**
 * lightTimeSpheresPass — the Earth-centred light-time spheres, additive on
 * NEAR0. `enabled` and `draw` read the same `deriveLightTimeLiveness`.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { LightTimeRuntime } from '../@types/LightTimeRuntime';
import { deriveLightTimeLiveness } from '../present/deriveLightTimeLiveness';

export function lightTimeSpheresPass(runtime: LightTimeRuntime): ContentPass {
  return {
    name: 'light-time-spheres',

    enabled(state, ctx, _view) {
      return deriveLightTimeLiveness(state, ctx) !== null;
    },

    // `ctx.cam`, not `view.vp`: the renderer builds its own view rays from the
    // camera basis rather than transforming vertices.
    draw(pass, view, ctx, state) {
      const liveness = deriveLightTimeLiveness(state, ctx);
      if (liveness === null) return;
      runtime.renderer.draw(pass, ctx.cam, ctx.drawCamPos, view.viewportPx, liveness);
    },
  };
}
