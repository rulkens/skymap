import { describe, it, expect, vi } from 'vitest';
import { createZoneOfAvoidanceRenderer } from '../../../../../src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer';

// Minimal mock GPUDevice — Vitest runs in Node without a WebGPU surface.
// Mirrors horizonShellRenderer.test.ts / labelRenderer.test.ts's pattern:
// every create* call returns a plausibly-shaped stand-in; createRenderPipeline
// optionally records the descriptors so pipeline shape can be asserted.
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return {};
    }),
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice;
}

describe('createZoneOfAvoidanceRenderer', () => {
  it('constructs under a null device', () => {
    expect(() => createZoneOfAvoidanceRenderer(mockDevice(), 'rgba16float')).not.toThrow();
  });

  it('builds a pick pipeline targeting r32uint with no blend and a depth test', () => {
    // Regression guard: a blend key on an integer target is a validation
    // error, and a missing depthStencil breaks occlusion against other
    // COSMO pick draws.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createZoneOfAvoidanceRenderer(mockDevice(renderPipelines), 'rgba16float');
    const pick = renderPipelines.find((p) => p.label === 'zoneOfAvoidance-pick-pipeline');
    expect(pick).toBeDefined();
    const target = Array.from(pick!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('r32uint');
    expect(target!.blend).toBeUndefined();
    expect(pick!.depthStencil).toBeDefined();
  });
});
