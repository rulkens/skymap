import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { LidarPointRenderer } from './lidarPointRenderer';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context. `epoch` bumps on every dispose so an awaited upload/build
 * can tell its result is stale; `gpu` outlives a dispose. `gpuAssets` is
 * keyed by `SceneAsset.id`.
 */
export type LidarGpuAsset = { vertexBuffer: GPUBuffer; pointCount: number };

export type RenderResources = {
  gpu: GpuContext | null;
  gpuAssets: Map<string, LidarGpuAsset>;
  lidar: LidarPointRenderer | null;
  depthTexture: GPUTexture | null;
  epoch: number;
};

export function createRenderResources(): RenderResources {
  return { gpu: null, gpuAssets: new Map(), lidar: null, depthTexture: null, epoch: 0 };
}

/**
 * Frees the previous group's device memory before the next group's uploads
 * allocate. `gpu` outlives a dispose; `epoch` bumps unconditionally (even
 * over an empty scene) because it is the staleness token an in-flight upload
 * compares against — see `acceptLoadedAsset`.
 */
export function disposeScene(resources: RenderResources): void {
  for (const asset of resources.gpuAssets.values()) asset.vertexBuffer.destroy();
  resources.gpuAssets.clear();
  resources.lidar?.dispose();
  resources.lidar = null;
  resources.depthTexture?.destroy();
  resources.depthTexture = null;
  resources.epoch += 1;
}
