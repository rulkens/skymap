/**
 * skyGridPass — draws the enabled coordinate grids, faded by the Layer's
 * handed value. `ctx.cam`, not `view.vp`: the renderer builds its own view
 * rays from the camera basis.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { SkyGridRuntime } from '../@types/SkyGridRuntime';

export function skyGridPass(runtime: SkyGridRuntime): ContentPass<'skyGrid'> {
  return {
    name: 'sky-grid',
    fade: 'skyGrid',
    enabled: () => true,
    draw(pass, view, ctx, state, fade) {
      runtime.renderer.draw(pass, ctx.cam, view.viewportPx, state.settings.skyGrid.frames, fade);
    },
  };
}
