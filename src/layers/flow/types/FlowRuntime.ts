/**
 * The flow family's whole runtime: the renderer and the slot that commits
 * into it. Non-null throughout — `create` builds both before returning, which
 * is what lets the pass, the compute row and the fade guard read the renderer
 * without a null check.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { FlowFieldRenderer } from '../../../@types/rendering/FlowFieldRenderer';

export type FlowRuntime = {
  readonly renderer: FlowFieldRenderer;
  readonly slot: AssetSlot<ScalarCube, void>;
};
