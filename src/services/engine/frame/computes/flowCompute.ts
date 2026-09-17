/**
 * flowCompute — TEMPORARY core row wrapping the CF4++ ribbon integrator's
 * pre-HDR dispatch (absorbed unchanged from the deleted `encodeFlowCompute`).
 * Gate: the renderer exists, `settings.flow.enabled`, and the velocity cube is
 * committed. Task 4 closes this over the flow Layer's own Runtime instead of
 * `state.gpu.flowFieldRenderer`; Task 6 deletes this file from core.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { slotReady } from '../../../loading/slotReady';

export const flowCompute: ContentCompute = {
  name: 'flow',
  encode(encoder, ctx, state, claimTimestampWrites) {
    const flowFieldRenderer = state.gpu.flowFieldRenderer;
    const flow = state.settings.flow;
    if (flowFieldRenderer === null || !flow.enabled || !slotReady(state.assetSlots.flow)) return;
    flowFieldRenderer.encodeCompute(encoder, flow, ctx.nowMs, claimTimestampWrites);
  },
};
