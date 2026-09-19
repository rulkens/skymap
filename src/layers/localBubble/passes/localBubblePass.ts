/**
 * localBubblePass — the additive Fresnel shell over the baked cavity mesh,
 * drawn on NEAR0 immediately after `milky-way` (`FRAME_ORDER`'s own comment
 * carries why: that pass's dust multiply must not darken this one). Takes a
 * plain `fadeAlpha` of 1 for now; Task 7 wires the toggle fade row's opacity
 * into this call site, and the constant does not survive that commit.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { LocalBubbleRuntime } from '../types/LocalBubbleRuntime';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { localBubbleOpacity } from '../present/localBubbleOpacity';
import { LOCAL_BUBBLE_TINT } from '../../../data/localBubble/localBubbleTint';

export function localBubblePass(runtime: LocalBubbleRuntime): ContentPass {
  return {
    name: 'local-bubble',

    enabled(state, _ctx, view) {
      if (!runtime.renderer.hasMesh()) return false;
      const camDistMpc = distanceMpc(view.camPos, RENDER_ORIGIN_MPC);
      return localBubbleOpacity(camDistMpc, 1, state.settings.localBubble.intensity) > 0;
    },

    draw(pass, view, _ctx, state) {
      const camDistMpc = distanceMpc(view.camPos, RENDER_ORIGIN_MPC);
      const opacity = localBubbleOpacity(camDistMpc, 1, state.settings.localBubble.intensity);
      if (opacity <= 0) return;
      runtime.renderer.draw(pass, view.vp, view.camPos, LOCAL_BUBBLE_TINT, opacity);
    },
  };
}
