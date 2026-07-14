import { describe, it, expect, vi } from 'vitest';
import { createHorizonShellRenderer } from '../../../../../src/services/gpu/renderers/horizonShell/horizonShellRenderer';

/**
 * Minimal GPUDevice mock for construction-time assertions. Vitest runs in Node
 * without a WebGPU surface, so every create* call the shell renderer issues at
 * construction returns a plausibly-shaped stand-in. The render-pipeline mock
 * records its descriptor so the colour-target format can be asserted.
 */
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
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

describe('createHorizonShellRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() =>
      createHorizonShellRenderer({ device: mockDevice(), targetFormat: 'rgba16float' }),
    ).not.toThrow();
  });

  it('bakes the given targetFormat into the pipeline colour target', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createHorizonShellRenderer({
      device: mockDevice(renderPipelines),
      targetFormat: 'rgba16float',
    });
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});
