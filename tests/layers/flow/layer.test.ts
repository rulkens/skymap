/**
 * flowLayer — pins the composed shape: exactly one row per runtime-bound
 * contribution, each named `flow`, mirroring the pass/asset/fade coverage
 * `filaments`/`galaxyCatalog` already exercise per-contribution.
 */
import { describe, it, expect, vi } from 'vitest';

import { flowLayer } from '../../../src/layers/flow/layer';
import { Source } from '../../../src/data/source';
import type { LayerCoreDeps } from '../../../src/@types/engine/layer/LayerCoreDeps';

/** Minimal GPUDevice mock — construction-only, mirrors create.test.ts. */
function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;
}

describe('flowLayer', () => {
  it('contributes exactly one named "flow" row to each runtime-bound surface', () => {
    const deps = { ctx: { device: mockDevice() } } as unknown as LayerCoreDeps;
    const runtime = flowLayer.create(deps);

    expect(flowLayer.passes(runtime).map((p) => p.name)).toEqual(['flow']);
    expect(flowLayer.computes?.(runtime).map((c) => c.name)).toEqual(['flow']);
    expect(flowLayer.assets?.(runtime).map((a) => a.key)).toEqual(['flow']);
    expect(flowLayer.fades?.(runtime).map((f) => f.key)).toEqual(['flow']);
  });

  it('declares its settings tuple, source row and both ui sections', () => {
    expect(flowLayer.settings?.map((s) => s.reducerPath)).toEqual(['flow']);
    expect(flowLayer.sources?.map(([code]) => code)).toEqual([Source.Flow]);
    expect(flowLayer.ui?.settings).toBeDefined();
    expect(flowLayer.ui?.debug).toBeDefined();
  });
});
