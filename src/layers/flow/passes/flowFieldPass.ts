/**
 * flowFieldPass — CF4++ peculiar-velocity ribbons, additive into HDR. It draws
 * only the trails the pre-HDR compute row (`flowCompute`) already integrated
 * this frame; it owns no compute work itself.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FlowRuntime } from '../@types/FlowRuntime';
import { slotReady } from '../../../services/loading/slotReady';

export function flowFieldPass(runtime: FlowRuntime): ContentPass<'flow'> {
  return {
    name: 'flow',
    fade: 'flow',

    // No cube committed → nothing to draw, even mid-fade.
    enabled: () => slotReady(runtime.slot),

    draw(pass, view, _ctx, state, fade) {
      runtime.renderer.draw(pass, view.vp, view.viewportPx, state.settings.flow, fade);
    },
  };
}
