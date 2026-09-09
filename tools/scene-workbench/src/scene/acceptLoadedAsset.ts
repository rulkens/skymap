import type { LidarGpuAsset, RenderResources } from '../render/renderResources';

/**
 * acceptLoadedAsset — where a completed upload decides whether it is still
 * wanted. Called from INSIDE the upload promise's own `.then()`, never after
 * a saga `yield*`: `takeLatest` unwinds the generator via `iterator.return()`
 * and drops the resolved value, so a check after that `yield*` is dead code.
 * `cancellation.aborted` (set in the worker's `finally`) covers cancellation;
 * `resources.epoch !== myEpoch` independently covers a dispose with no
 * cancellation at all (Viewport's unmount). Shape and full reasoning:
 * `tools/mcpm-workbench/src/state/scene/acceptBuiltHarness.ts`.
 */
export function acceptLoadedAsset(
  built: LidarGpuAsset,
  resources: Pick<RenderResources, 'epoch'>,
  myEpoch: number,
  cancellation: { readonly aborted: boolean },
): LidarGpuAsset | null {
  if (cancellation.aborted || resources.epoch !== myEpoch) {
    built.vertexBuffer.destroy();
    return null;
  }
  return built;
}
