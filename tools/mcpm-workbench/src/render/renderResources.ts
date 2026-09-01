import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { AgentWeights } from '../../@types/AgentWeights';
import type { McpmHarness } from '../../@types/McpmHarness';
import type { RenderGraph } from './RenderGraph';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context (Task 6+) in place of Viewport's closure locals. `epoch`
 * bumps on every dispose so an awaited readback/build can tell its result is
 * stale. `gpu` outlives a dispose, same as Viewport's `gpuCtx`. `weights` is
 * the harness's own seed derivation — Viewport's export leg (runExport) needs
 * the SAME weights the running harness was built with, not a copy re-derived
 * from the current (possibly since-changed) weightMode.
 */
export type RenderResources = {
  gpu: GpuContext | null;
  harness: McpmHarness | null;
  weights: AgentWeights | null;
  graph: RenderGraph | null;
  previewBuffer: GPUBuffer | null;
  epoch: number;
};

export function createRenderResources(): RenderResources {
  return { gpu: null, harness: null, weights: null, graph: null, previewBuffer: null, epoch: 0 };
}

/**
 * Preview buffer → graph → harness: old device memory freed before a
 * rebuild allocates the next box-sized grid (Viewport's `disposeHarness`
 * ordering — the double-resident-buffers landmine). `gpu` outlives a dispose.
 */
export function disposeScene(resources: RenderResources): void {
  resources.previewBuffer?.destroy();
  resources.graph?.dispose();
  resources.harness?.dispose();
  resources.previewBuffer = null;
  resources.graph = null;
  resources.harness = null;
  resources.weights = null;
  resources.epoch += 1;
}
