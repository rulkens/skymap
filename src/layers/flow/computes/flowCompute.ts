/**
 * flowCompute — the CF4++ ribbon integrator's pre-HDR dispatch: seed-when-armed
 * then advect/streamline, both into the frame's own encoder — no out-of-band
 * submit; WebGPU inserts the storage barrier between the two compute passes.
 * Gate: the handed value above 0 AND the velocity cube committed, so the ribbons
 * keep advecting through a fade-out instead of freezing when the switch goes off.
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { FlowRuntime } from '../@types/FlowRuntime';
import { slotReady } from '../../../services/loading/slotReady';

export function flowCompute(runtime: FlowRuntime): ContentCompute<'flow'> {
  return {
    name: 'flow',
    scope: 'once',
    fade: 'flow',
    encode(encoder, ctx, state, claimTimestampWrites, fade) {
      if (fade === 0 || !slotReady(runtime.slot)) return;
      runtime.renderer.encodeCompute(
        encoder,
        state.settings.flow,
        ctx.snapshot.nowMs,
        claimTimestampWrites,
      );
    },
  };
}
