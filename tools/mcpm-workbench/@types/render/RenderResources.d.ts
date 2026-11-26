import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { McpmHarness } from '../sim/McpmHarness';
import type { BuildInputs } from './BuildInputs';
import type { RenderGraph } from './RenderGraph';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context. `epoch` bumps on every dispose so an awaited readback/build
 * can tell its result is stale; `gpu` outlives a dispose. `built` is set
 * together with `harness` and cleared with it.
 */
export type RenderResources = {
  gpu: GpuContext | null;
  harness: McpmHarness | null;
  built: BuildInputs | null;
  graph: RenderGraph | null;
  previewBuffer: GPUBuffer | null;
  epoch: number;
};
