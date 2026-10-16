/**
 * localBubblePass — the additive Fresnel shell over the baked cavity mesh,
 * drawn on NEAR0 immediately after `milky-way` (`FRAME_ORDER`'s own comment
 * carries why). Core hands the toggle fade with the clip folded in; the draw
 * composes the shell's focus emphasis on it (the shell is never a focus).
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { LocalBubbleRuntime } from '../@types/LocalBubbleRuntime';
import { localBubbleOpacity } from '../present/localBubbleOpacity';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { localBubbleVisibility } from '../visibility';

export function localBubblePass(runtime: LocalBubbleRuntime): ContentPass<'localBubble'> {
  const entry = visibilityEntryOf(localBubbleVisibility, 'localBubble');
  return {
    name: 'local-bubble',
    fade: 'localBubble',

    enabled(state, _ctx, view, fade) {
      if (!runtime.renderer.hasMesh()) return false;
      const camDistMpc = Math.hypot(...view.camPos);
      return localBubbleOpacity(camDistMpc, fade, state.settings.localBubble.intensity) > 0;
    },

    draw(pass, view, ctx, state, fade) {
      const camDistMpc = Math.hypot(...view.camPos);
      const opacity = localBubbleOpacity(
        camDistMpc,
        fade * emphasisOf(entry, ctx.snapshot),
        state.settings.localBubble.intensity,
      );
      runtime.renderer.draw(pass, view.vp, view.camPos, opacity);
    },
  };
}
