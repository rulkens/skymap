/**
 * encodeFlowCompute — pre-HDR compute dispatch for the flow-field layer.
 *
 * The engine's first compute step. Runs inside the single per-frame command
 * encoder, BEFORE the HDR render step opens (alongside `scalarVolumeLayer`),
 * because the compute pass writes the trail buffers that the ribbon draw
 * (`flowFieldLayer`, an hdr-target layer) reads later the same frame. WebGPU
 * orders the compute write before the subsequent vertex read.
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

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { slotReady } from '../../loading/slotReady';

/**
 * Encode the flow-field compute dispatch into `encoder`, reading its own gate
 * straight off `state`: the renderer handle (`state.gpu.flowFieldRenderer`),
 * the user toggle (`state.settings.flow`), and the demand-load status
 * (`slotReady(state.assetSlots.flow)`). All three must hold — otherwise this is
 * a no-op, the common default-off path.
 *
 * Reading the gate off `state` (rather than a caller-assembled arg bag) is what
 * lets the frame executor's COMPUTE table hold a uniform
 * `(encoder, ctx, state) => void` row per compute step, with no bespoke
 * plumbing at the call site. `nowMs` rides that same row from `ctx`: it is the
 * renderer's advection clock, which counts seconds rather than rendered frames
 * (see `flowFieldRenderer.encodeCompute`).
 */
export function encodeFlowCompute(
  encoder: GPUCommandEncoder,
  state: EngineState,
  nowMs: number,
): void {
  const flowFieldRenderer = state.gpu.flowFieldRenderer;
  const flow = state.settings.flow;
  if (flowFieldRenderer === null || !flow.enabled || !slotReady(state.assetSlots.flow)) return;
  flowFieldRenderer.encodeCompute(encoder, flow, nowMs);
}
