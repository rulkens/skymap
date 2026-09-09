import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { LidarPointRenderer } from './lidarPointRenderer';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context. `gpu` outlives a dispose; `gpuAssets` is keyed by
 * `SceneAsset.id` (see `disposeScene` for the `epoch` contract).
 */
export type LidarGpuAsset = {
  readonly kind: 'pointCloud';
  readonly vertexBuffer: GPUBuffer;
  readonly pointCount: number;
  dispose(): void;
};

/** One member today — a Gaussian-splat asset is the next addition. */
export type GpuAsset = LidarGpuAsset;

export type RenderResources = {
  gpu: GpuContext | null;
  gpuAssets: Map<string, GpuAsset>;
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
  for (const asset of resources.gpuAssets.values()) asset.dispose();
  resources.gpuAssets.clear();
  resources.lidar?.dispose();
  resources.lidar = null;
  resources.depthTexture?.destroy();
  resources.depthTexture = null;
  resources.epoch += 1;
}
