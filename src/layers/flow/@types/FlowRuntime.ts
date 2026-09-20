/**
 * Non-null throughout — `create` builds both before returning, so the pass,
 * compute row, and fade guard read `renderer` with no null check.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { FlowFieldRenderer } from '../../../@types/rendering/FlowFieldRenderer';

export type FlowRuntime = {
  readonly renderer: FlowFieldRenderer;
  readonly slot: AssetSlot<ScalarCube, void>;
};
