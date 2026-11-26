import type { RenderResources } from '../../@types/render/RenderResources';

/**
 * Preview buffer → graph → harness: old device memory freed before a
 * rebuild allocates the next box-sized grid (the double-resident-buffers
 * landmine). `gpu` outlives a dispose.
 */
export function disposeScene(resources: RenderResources): void {
  resources.previewBuffer?.destroy();
  resources.graph?.dispose();
  resources.harness?.dispose();
  resources.previewBuffer = null;
  resources.graph = null;
  resources.harness = null;
  resources.built = null;
  resources.epoch += 1;
}
