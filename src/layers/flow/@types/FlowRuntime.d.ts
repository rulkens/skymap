/**
 * Non-null throughout — `create` builds both before returning, so the pass,
 * compute row, and fade guard read `renderer` with no null check.
 */

import type { AssetSlot } from '../../../../packages/shared/src/@types/loading/AssetSlot';
import type { ScalarCube } from '../../../../packages/shared/src/@types/data/volume/ScalarCube';
import type { FlowFieldRenderer } from '../streamlines/@types/FlowFieldRenderer';

export type FlowRuntime = {
  readonly renderer: FlowFieldRenderer;
  readonly slot: AssetSlot<ScalarCube, void>;
};
