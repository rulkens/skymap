/**
 * labelsWorldPass — draws the world-space (3D) MSDF lettering the
 * `label3DRenderer` was fed this frame, e.g. the Zone of Avoidance band's
 * curved caption. The 2D twins are `labelsCosmoPass` / `labelsNearPass`.
 *
 * No `fade`: each producer's label already carries its own opacity.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';

export const labelsWorldPass: ContentPass = {
  name: 'labels-world',

  enabled(state) {
    const r = state.gpu.label3DRenderer;
    return r !== null && r.glyphCount() > 0;
  },

  draw(pass, view, ctx, state) {
    state.gpu.label3DRenderer!.draw(pass, view.vp, view.viewportPx, ctx.drawPxPerRad);
  },
};
