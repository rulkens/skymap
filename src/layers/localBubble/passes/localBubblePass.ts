/**
 * localBubblePass — the additive Fresnel shell over the baked cavity mesh,
 * drawn on NEAR0 immediately after `milky-way` (`FRAME_ORDER`'s own comment
 * carries why). Core hands the toggle fade with recession and clip folded in.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { LocalBubbleRuntime } from '../@types/LocalBubbleRuntime';
import { localBubbleOpacity } from '../present/localBubbleOpacity';

export function localBubblePass(runtime: LocalBubbleRuntime): ContentPass<'localBubble'> {
  return {
    name: 'local-bubble',
    fade: 'localBubble',

    enabled(state, _ctx, view, fade) {
      if (!runtime.renderer.hasMesh()) return false;
      const camDistMpc = Math.hypot(...view.camPos);
      return localBubbleOpacity(camDistMpc, fade, state.settings.localBubble.intensity) > 0;
    },

    draw(pass, view, _ctx, state, fade) {
      const camDistMpc = Math.hypot(...view.camPos);
      const opacity = localBubbleOpacity(camDistMpc, fade, state.settings.localBubble.intensity);
      runtime.renderer.draw(pass, view.vp, view.camPos, opacity);
    },
  };
}
