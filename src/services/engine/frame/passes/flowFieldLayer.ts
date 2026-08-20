/**
 * flowFieldLayer — CF4++ peculiar-velocity ribbons, additive into HDR. It draws
 * only the trails the pre-HDR compute step (`encodeFlowCompute`) already
 * integrated this frame; it owns no compute work itself.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { slotReady } from '../../../loading/slotReady';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

export const flowFieldLayer: ContentLayer = {
  name: 'flow',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // No cube committed → nothing to draw, even mid-fade.
    if (!slotReady(state.assetSlots.flow)) return false;
    if (state.settings.flow.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'flow' }, ctx.nowMs) > 0;
  },

  draw(pass, view, ctx, state) {
    if (state.gpu.flowFieldRenderer === null) return;
    state.gpu.flowFieldRenderer.draw(
      pass,
      view.vp,
      view.viewportPx,
      state.settings.flow,
      resolveLayerOpacity(state, ctx, { kind: 'flow' }),
    );
  },
};
