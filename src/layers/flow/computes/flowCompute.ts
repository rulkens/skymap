/**
 * flowCompute — the CF4++ ribbon integrator's pre-HDR dispatch: seed-when-armed
 * then advect/streamline, both into the frame's own encoder — no out-of-band
 * submit; WebGPU inserts the storage barrier between the two compute passes.
 * Gate: `settings.flow.enabled` AND the velocity cube committed; the
 * renderer-null branch is gone — a Layer's renderer is non-null by construction.
 */

import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { FlowRuntime } from '../@types/FlowRuntime';
import { slotReady } from '../../../services/loading/slotReady';

export function flowCompute(runtime: FlowRuntime): ContentCompute {
  return {
    name: 'flow',
    encode(encoder, ctx, state, claimTimestampWrites) {
      const flow = state.settings.flow;
      if (!flow.enabled || !slotReady(runtime.slot)) return;
      runtime.renderer.encodeCompute(encoder, flow, ctx.nowMs, claimTimestampWrites);
    },
  };
}
