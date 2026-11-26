import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { AgentWeights } from '../catalog/AgentWeights';
import type { McpmHarness } from '../sim/McpmHarness';
import type { RenderGraph } from './RenderGraph';

/**
 * RenderResources — the engine-side objects a scene rebuild owns, held in
 * saga context. `epoch` bumps on every dispose so an awaited readback/build
 * can tell its result is stale; `gpu` outlives a dispose. `weights` is the
 * harness's own seed derivation — `watchExportSaga` needs the SAME weights
 * the running harness was built with, not a copy re-derived from the
 * current (possibly since-changed) weightMode.
 */
export type RenderResources = {
  gpu: GpuContext | null;
  harness: McpmHarness | null;
  weights: AgentWeights | null;
  graph: RenderGraph | null;
  previewBuffer: GPUBuffer | null;
  epoch: number;
};
