/**
 * computes/index — CORE's half of the contributed-compute registry;
 * `createLayers` appends each Layer's own compute rows onto `state.computes`.
 * It states no order — `FRAME_ORDER` (`frameOrder.ts`) is the one artifact
 * naming which row runs, in what order, in the frame's prelude.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { flowCompute } from '../../../../layers/flow/computes/flowCompute';
import type { FlowRuntime } from '../../../../layers/flow/types/FlowRuntime';
import { skyViewCompute } from './skyViewCompute';

/**
 * TEMPORARY: `flowCompute` now takes the flow Layer's own Runtime (05b Task
 * 4), which doesn't exist until the Layer forms (Task 5) — core still owns
 * this row until then, rebuilding the Runtime shape from `state.gpu`/
 * `state.assetSlots` each call (both non-null by the time a frame encodes).
 * Deleted along with this whole row in Task 6.
 */
const flowComputeCore: ContentCompute = {
  name: 'flow',
  encode: (encoder, ctx, state, claimTimestampWrites) =>
    flowCompute({
      renderer: state.gpu.flowFieldRenderer,
      slot: state.assetSlots.flow,
    } as unknown as FlowRuntime).encode(encoder, ctx, state, claimTimestampWrites),
};

/** Core's contributed compute rows, as a flat set. States no order or grouping. */
export const CORE_COMPUTES: readonly ContentCompute[] = [flowComputeCore, skyViewCompute];
