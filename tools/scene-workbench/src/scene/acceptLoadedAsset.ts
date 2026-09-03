import type { LidarGpuAsset, RenderResources } from '../render/renderResources';

/**
 * acceptLoadedAsset — the one place a completed point-cloud upload decides
 * whether it is still wanted. Called from INSIDE the upload promise's own
 * `.then()`, never after a saga `yield*`: `takeLatest` cancellation unwinds
 * the generator via `iterator.return()` synchronously and drops the eventual
 * resolved value instead of resuming with it, so code after that `yield*`
 * can never run for an upload cancelled while it was in flight.
 * `cancellation.aborted` (set synchronously in the worker's own `finally`,
 * which DOES run at cancellation time) catches that case here instead.
 * `resources.epoch !== myEpoch` is the second, independent guard: a dispose
 * WITHOUT saga cancellation at all (Viewport's unmount calls `disposeScene`
 * directly) bumps epoch but never touches `cancellation`.
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
