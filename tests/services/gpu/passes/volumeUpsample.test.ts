/**
 * volumeUpsample — unit tests for the half-res-to-HDR upsample pass
 * factory.  Mocks GPUDevice so the test runs in Vitest without a real
 * GPU.  Covers:
 *
 *   - the factory builds a pipeline with additive blend for both
 *     color and alpha (this is the load-bearing invariant — the
 *     upsample must add into HDR, not overwrite)
 *   - the linear sampler used for bilinear is allocated
 *   - draw() records exactly the expected commands on the pass
 *   - destroy() doesn't throw
 */
import { describe, it, expect, vi } from 'vitest';
import { createVolumeUpsample } from '../../../../src/services/gpu/passes/volumeUpsample';

function mockDevice(): GPUDevice {
  const renderPipelineDescs: GPURenderPipelineDescriptor[] = [];
  const samplerDescs: GPUSamplerDescriptor[] = [];
  return {
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn((desc: GPUSamplerDescriptor) => {
      samplerDescs.push(desc);
      return {};
    }),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelineDescs.push(desc);
      return {};
    }),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
    // Test-only escape hatch: expose what the factory created.
    __renderPipelineDescs: renderPipelineDescs,
    __samplerDescs: samplerDescs,
  } as unknown as GPUDevice;
}

describe('createVolumeUpsample', () => {
  it('builds a pipeline with additive blend for color and alpha', () => {
    const device = mockDevice();
    createVolumeUpsample(device, 'rgba16float');
    const descs = (device as any).__renderPipelineDescs as GPURenderPipelineDescriptor[];
    expect(descs).toHaveLength(1);
    const target = (descs[0]!.fragment as GPUFragmentState).targets![0]!;
    expect(target!.blend).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
  });

  it('uses a linear sampler so the GPU performs the bilinear filter', () => {
    const device = mockDevice();
    createVolumeUpsample(device, 'rgba16float');
    const samplers = (device as any).__samplerDescs as GPUSamplerDescriptor[];
    expect(samplers).toHaveLength(1);
    expect(samplers[0]!.magFilter).toBe('linear');
    expect(samplers[0]!.minFilter).toBe('linear');
  });

  it('draw() records setPipeline, setBindGroup, draw(3, 1)', () => {
    const device = mockDevice();
    const upsample = createVolumeUpsample(device, 'rgba16float');
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const halfResView = {} as GPUTextureView;
    upsample.draw(pass, halfResView);
    expect(pass.setPipeline).toHaveBeenCalledTimes(1);
    expect(pass.setBindGroup).toHaveBeenCalledTimes(1);
    expect(pass.draw).toHaveBeenCalledWith(3, 1, 0, 0);
  });

  it('destroy() does not throw', () => {
    const device = mockDevice();
    const upsample = createVolumeUpsample(device, 'rgba16float');
    expect(() => upsample.destroy()).not.toThrow();
  });
});
