import { describe, expect, it, vi } from 'vitest';
import {
  createRenderResources,
  disposeScene,
} from '../../../../tools/mcpm-workbench/src/render/renderResources';
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { AgentWeights } from '../../../../tools/mcpm-workbench/@types/AgentWeights';
import type { McpmHarness } from '../../../../tools/mcpm-workbench/@types/McpmHarness';
import type { RenderGraph } from '../../../../tools/mcpm-workbench/src/render/RenderGraph';

function stubResources() {
  const calls: string[] = [];
  const previewBuffer = { destroy: vi.fn(() => calls.push('preview')) } as unknown as GPUBuffer;
  const graph = { dispose: vi.fn(() => calls.push('graph')) } as unknown as RenderGraph;
  const harness = { dispose: vi.fn(() => calls.push('harness')) } as unknown as McpmHarness;
  const gpu = {} as GpuContext;
  const weights = { weights: new Float32Array(), nanCount: 0, medianLog10Mass: 10 } as AgentWeights;
  const resources = createRenderResources();
  resources.gpu = gpu;
  resources.harness = harness;
  resources.weights = weights;
  resources.graph = graph;
  resources.previewBuffer = previewBuffer;
  return { calls, previewBuffer, graph, harness, gpu, weights, resources };
}

describe('disposeScene', () => {
  it('disposes preview buffer, then graph, then harness — old device memory freed before a rebuild allocates', () => {
    const { calls, previewBuffer, graph, harness, resources } = stubResources();

    disposeScene(resources);

    expect(previewBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(graph.dispose).toHaveBeenCalledTimes(1);
    expect(harness.dispose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['preview', 'graph', 'harness']);
  });

  it('nulls harness, weights, graph and previewBuffer but leaves gpu untouched — the device outlives a rebuild', () => {
    const { resources, gpu } = stubResources();

    disposeScene(resources);

    expect(resources.harness).toBeNull();
    expect(resources.weights).toBeNull();
    expect(resources.graph).toBeNull();
    expect(resources.previewBuffer).toBeNull();
    expect(resources.gpu).toBe(gpu);
  });

  it('is idempotent — a second dispose on an already-empty holder is safe and still bumps epoch', () => {
    const { resources } = stubResources();
    disposeScene(resources);

    expect(() => disposeScene(resources)).not.toThrow();
    expect(resources.epoch).toBe(2);
  });
});
