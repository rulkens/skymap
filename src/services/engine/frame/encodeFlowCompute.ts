/**
 * encodeFlowCompute — pre-HDR compute dispatch for the flow-field layer.
 *
 * The engine's first compute step. Runs inside the single per-frame command
 * encoder, BEFORE the HDR mega-pass opens (alongside `encodeVolumes`), because
 * the compute pass writes the trail buffers that the ribbon draw (`flowFieldPass`,
 * an `HDR_PASSES` entry) reads later the same frame. WebGPU orders the compute
 * write before the subsequent vertex read.
 *
 * ### No out-of-band submit (decision §5)
 *
 * Everything is encoded into the passed-in `encoder`: the dedicated `seed` pass
 * (when a reseed is pending) AND the steady integrate pass. WebGPU inserts the
 * storage barrier between the two compute passes, and the frame's single
 * `queue.submit` downstream covers both. The seed-vs-steady distinction is
 * *which passes get encoded*, never a mutable uniform mutated between submits —
 * that is what dissolves the spike's writeBuffer/submit seed race. See
 * `flowFieldRenderer.encodeCompute`.
 *
 * ### Gate
 *
 * Three conditions, all required: the renderer exists (post-bootstrap), the
 * user has the layer enabled (`settings.flow.enabled`), and the velocity cube
 * has been committed (`slotReady(assetSlots.flow)`). The renderer also self-guards
 * on its own `field !== null`, but gating here avoids the call entirely on the
 * common default-off path.
 */

import type { EncodeFlowComputeArgs } from '../../../@types/engine/frame/EncodeFlowComputeArgs';

export function encodeFlowCompute(args: EncodeFlowComputeArgs): void {
  const { encoder, flowFieldRenderer, flow, loaded } = args;
  if (flowFieldRenderer === null || !flow.enabled || !loaded) return;
  flowFieldRenderer.encodeCompute(encoder, flow);
}
