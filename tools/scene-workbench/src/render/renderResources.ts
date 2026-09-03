import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context. `epoch` bumps on every dispose so an awaited upload/build
 * can tell its result is stale; `gpu` outlives a dispose. `gpuAssets` is
 * keyed by `SceneAsset.id` — task 12 fills in `uploadPointCloud`/`disposeScene`.
 */
export type LidarGpuAsset = { vertexBuffer: GPUBuffer; pointCount: number };

export type RenderResources = {
  gpu: GpuContext | null;
  gpuAssets: Map<string, LidarGpuAsset>;
  depthTexture: GPUTexture | null;
  epoch: number;
};

export function createRenderResources(): RenderResources {
  return { gpu: null, gpuAssets: new Map(), depthTexture: null, epoch: 0 };
}
