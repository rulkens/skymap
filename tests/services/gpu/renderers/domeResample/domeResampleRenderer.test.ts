/**
 * domeResampleRenderer — structural tests against a mocked GPUDevice
 * (`cubeFaceBlitRenderer.test.ts`'s pattern), plus the real `?static` import
 * so wesl-plugin's link of `domeResample.wesl` runs under Vitest.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDomeResampleRenderer } from '../../../../../src/services/gpu/renderers/domeResample/domeResampleRenderer';

function mockDevice() {
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createSampler: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
  } as unknown as GPUDevice;
  return { device, bindGroupDescs };
}

function mockPass() {
  return { setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn() };
}

describe('createDomeResampleRenderer', () => {
  it('rebuilds its bind group per draw around the given dome-cube view', () => {
    const m = mockDevice();
    const renderer = createDomeResampleRenderer({ device: m.device, targetFormat: 'rgba16float' });
    const facesA = { __view: 'a' } as unknown as GPUTextureView;
    const facesB = { __view: 'b' } as unknown as GPUTextureView;

    const passA = mockPass();
    renderer.draw(passA as unknown as GPURenderPassEncoder, facesA);
    const passB = mockPass();
    renderer.draw(passB as unknown as GPURenderPassEncoder, facesB);

    const facesOf = (desc: GPUBindGroupDescriptor) =>
      Array.from(desc.entries).find((e) => e.binding === 0)!.resource;
    expect(m.bindGroupDescs.map(facesOf)).toEqual([facesA, facesB]);
    expect(passA.setBindGroup).toHaveBeenCalledWith(0, {});
    expect(passA.draw).toHaveBeenCalledWith(3);
  });
});
