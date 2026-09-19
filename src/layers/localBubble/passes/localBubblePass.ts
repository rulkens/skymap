/**
 * localBubblePass — the additive Fresnel shell over the baked cavity mesh,
 * drawn on NEAR0 immediately after `milky-way` (`FRAME_ORDER`'s own comment
 * carries why: that pass's dust multiply must not darken this one).
 * `resolveLayerOpacity` folds in the toggle fade row, focus recession and
 * any clip factor — the `localBubble` fade row's own guard
 * (`runtime.renderer.hasMesh()`) is what keeps a still-loading slot from
 * fading in over nothing.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { LocalBubbleRuntime } from '../types/LocalBubbleRuntime';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { localBubbleOpacity } from '../present/localBubbleOpacity';
import { LOCAL_BUBBLE_TINT } from '../../../data/localBubble/localBubbleTint';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';

export function localBubblePass(runtime: LocalBubbleRuntime): ContentPass {
  return {
    name: 'local-bubble',

    enabled(state, ctx, view) {
      if (!runtime.renderer.hasMesh()) return false;
      const camDistMpc = distanceMpc(view.camPos, RENDER_ORIGIN_MPC);
      const fadeAlpha = resolveLayerOpacity(state, ctx, { kind: 'localBubble' });
      return localBubbleOpacity(camDistMpc, fadeAlpha, state.settings.localBubble.intensity) > 0;
    },

    draw(pass, view, ctx, state) {
      const camDistMpc = distanceMpc(view.camPos, RENDER_ORIGIN_MPC);
      const fadeAlpha = resolveLayerOpacity(state, ctx, { kind: 'localBubble' });
      const opacity = localBubbleOpacity(
        camDistMpc,
        fadeAlpha,
        state.settings.localBubble.intensity,
      );
      if (opacity <= 0) return;
      runtime.renderer.draw(pass, view.vp, view.camPos, LOCAL_BUBBLE_TINT, opacity);
    },
  };
}
