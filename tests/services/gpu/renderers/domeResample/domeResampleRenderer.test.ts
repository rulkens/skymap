/**
 * domeResampleRenderer — structural tests against a mocked GPUDevice
 * (`cubeFaceBlitRenderer.test.ts`'s pattern), plus the real `?static` imports
 * so weslStaticPlugin's link of `domeResample/vertex.wesl`, `fragment.wesl` and
 * `fragmentOcclusion.wesl` (and through them `fisheye.wesl`) runs under Vitest.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDomeResampleRenderer } from '../../../../../src/services/gpu/renderers/domeResample/domeResampleRenderer';
import fsOcclusionCode from '../../../../../src/services/gpu/shaders/domeResample/fragmentOcclusion.wesl?static';

function mockDevice() {
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createSampler: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => ({ of: desc.label })),
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
    const renderer = createDomeResampleRenderer({
      device: m.device,
      targetFormat: 'rgba16float',
      occlusionFormat: 'rg32float',
    });
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

  it('resamples the masks through their own pipeline, around the given view', () => {
    const m = mockDevice();
    const renderer = createDomeResampleRenderer({
      device: m.device,
      targetFormat: 'rgba16float',
      occlusionFormat: 'rg32float',
    });
    const faceMasks = { __view: 'masks' } as unknown as GPUTextureView;
    const pass = mockPass();
    renderer.drawOcclusion(pass as unknown as GPURenderPassEncoder, faceMasks);

    // The colour pipeline writes rgba16float: bound to the mask target it fails validation.
    expect(pass.setPipeline).toHaveBeenCalledWith({ of: 'domeResample-occlusion-pipeline' });
    expect(Array.from(m.bindGroupDescs[0]!.entries).map((e) => e.resource)).toEqual([faceMasks]);
    expect(pass.draw).toHaveBeenCalledWith(3);
  });

  it('the mask resample takes a single texel', () => {
    // rg32float is unfilterable: a `textureSample` here fails validation on a device only.
    expect(fsOcclusionCode).toContain('textureLoad');
    expect(fsOcclusionCode).not.toContain('textureSample');
  });
});
