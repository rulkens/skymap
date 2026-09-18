/**
 * flowFieldPass — CF4++ peculiar-velocity ribbons, additive into HDR. It draws
 * only the trails the pre-HDR compute row (`flowCompute`) already integrated
 * this frame; it owns no compute work itself.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FlowRuntime } from '../types/FlowRuntime';
import { slotReady } from '../../../services/loading/slotReady';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';

export function flowFieldPass(runtime: FlowRuntime): ContentPass {
  return {
    name: 'flow',

    enabled(state, ctx, _view) {
      // No cube committed → nothing to draw, even mid-fade.
      if (!slotReady(runtime.slot)) return false;
      if (state.settings.flow.enabled) return true;
      return state.subsystems.fades.opacityOf({ kind: 'flow' }, ctx.nowMs) > 0;
    },

    draw(pass, view, ctx, state) {
      runtime.renderer.draw(
        pass,
        view.vp,
        view.viewportPx,
        state.settings.flow,
        resolveLayerOpacity(state, ctx, { kind: 'flow' }),
      );
    },
  };
}
