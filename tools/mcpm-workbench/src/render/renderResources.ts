import type { RenderResources } from '../../@types/render/RenderResources';

export function createRenderResources(): RenderResources {
  return { gpu: null, harness: null, built: null, graph: null, previewBuffer: null, epoch: 0 };
}
