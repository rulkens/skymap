/**
 * composeRenderTargetRows — core's `renderTargetRows` followed by every
 * Layer's static `targets`, in tuple order, guarded by `concatUniqueRows`.
 * Shared by the `renderTargets` GPU-handle row and `frameOrderBoot.test.ts`,
 * so boot allocation and the boot check walk the identical composed table.
 */

import type { RenderTargetSpec } from '../../../@types/engine/frame/RenderTargetSpec';
import { renderTargetRows } from '../../gpu/renderTargets';
import { concatUniqueRows } from '../../../utils/object/concatUniqueRows';

export function composeRenderTargetRows(
  swapFormat: GPUTextureFormat,
  layerTargets: readonly (readonly RenderTargetSpec[])[],
): readonly RenderTargetSpec[] {
  return concatUniqueRows('render targets', (row) => row.id, [
    renderTargetRows(swapFormat),
    ...layerTargets,
  ]);
}
