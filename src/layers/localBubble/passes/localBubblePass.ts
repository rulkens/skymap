/**
 * localBubblePass — the additive Fresnel shell over the baked cavity mesh,
 * drawn on NEAR0 immediately after `milky-way` (`FRAME_ORDER`'s own comment
 * carries why). `resolveLayerOpacity` folds in the toggle fade row, focus
 * recession and any clip factor.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { LocalBubbleRuntime } from '../types/LocalBubbleRuntime';
import { localBubbleOpacity } from '../present/localBubbleOpacity';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';

export function localBubblePass(runtime: LocalBubbleRuntime): ContentPass {
  return {
    name: 'local-bubble',

    enabled(state, ctx, view) {
      if (!runtime.renderer.hasMesh()) return false;
      const camDistMpc = Math.hypot(...view.camPos);
      const fadeAlpha = resolveLayerOpacity(state, ctx, { kind: 'localBubble' });
      return localBubbleOpacity(camDistMpc, fadeAlpha, state.settings.localBubble.intensity) > 0;
    },

    draw(pass, view, ctx, state) {
      const camDistMpc = Math.hypot(...view.camPos);
      const fadeAlpha = resolveLayerOpacity(state, ctx, { kind: 'localBubble' });
      const opacity = localBubbleOpacity(
        camDistMpc,
        fadeAlpha,
        state.settings.localBubble.intensity,
      );
      runtime.renderer.draw(pass, view.vp, view.camPos, opacity);
    },
  };
}
