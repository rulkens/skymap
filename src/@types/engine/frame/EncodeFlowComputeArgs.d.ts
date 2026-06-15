/**
 * EncodeFlowComputeArgs — inputs for `encodeFlowCompute()`.
 *
 * Named arg-bag, same rationale as the sibling frame-encoder helpers (e.g.
 * `EncodeVolumesArgs`): the caller threads a few values through one indirection
 * site, and a struct keeps the call shape legible.
 *
 * The gate is the singleton-overlay-layer split: `flow.enabled` (from
 * `settings.flow`) is the user toggle, `loaded` (from
 * `slotReady(assetSlots.flow)`) is the demand-load status. Both must be true, and
 * the renderer non-null, before the compute work is dispatched.
 */

import type { FlowFieldRenderer } from '../../rendering/FlowFieldRenderer';
import type { FlowSettings } from '../../settings/FlowSettings';

export type EncodeFlowComputeArgs = {
  encoder: GPUCommandEncoder;
  /**
   * Flow renderer. Null in the bootstrap window before `initGpu` wires it up;
   * the helper is a no-op in that case.
   */
  flowFieldRenderer: FlowFieldRenderer | null;
  /** The user-facing flow settings slice (`state.settings.flow`). */
  flow: FlowSettings;
  /** The flow layer's demand-load status (`slotReady(state.assetSlots.flow)`). */
  loaded: boolean;
};
