/**
 * starAggregateUpsample — unit tests for the half-res-to-HDR survey-star
 * aggregate composite factory. Mocks GPUDevice so the test runs in Vitest
 * without a real GPU. Covers the load-bearing behaviours:
 *
 *   - additive blend for BOTH colour and alpha (the composite must ADD its
 *     knee'd result into HDR, not overwrite);
 *   - a linear sampler for the free 2x bilinear upscale;
 *   - draw() binds the passed-in half-res view (a stale-view refactor would
 *     silently bind closure state without tripping the call-count assertions);
 *   - destroy() doesn't throw.
 */
import { describe, it, expect, vi } from 'vitest';
import { createStarAggregateUpsample } from '../../../../src/services/gpu/passes/starAggregateUpsample';

function mockDevice(): GPUDevice {
  const renderPipelineDescs: GPURenderPipelineDescriptor[] = [];
  const samplerDescs: GPUSamplerDescriptor[] = [];
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  return {
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
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
    queue: { writeBuffer: vi.fn() },
    __renderPipelineDescs: renderPipelineDescs,
    __samplerDescs: samplerDescs,
    __bindGroupDescs: bindGroupDescs,
  } as unknown as GPUDevice;
}

describe('createStarAggregateUpsample', () => {
  it('builds a pipeline with additive blend for colour and alpha', () => {
    const device = mockDevice();
    createStarAggregateUpsample(device, 'rgba16float');
    const descs = (device as any).__renderPipelineDescs as GPURenderPipelineDescriptor[];
    expect(descs).toHaveLength(1);
    const target = (descs[0]!.fragment as GPUFragmentState).targets![0]!;
    expect(target!.blend).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
  });

  it('uses a linear sampler for the bilinear upscale', () => {
    const device = mockDevice();
    createStarAggregateUpsample(device, 'rgba16float');
    const samplers = (device as any).__samplerDescs as GPUSamplerDescriptor[];
    expect(samplers).toHaveLength(1);
    expect(samplers[0]!.magFilter).toBe('linear');
    expect(samplers[0]!.minFilter).toBe('linear');
  });

  it('draw() records the fullscreen draw binding the passed half-res view', () => {
    const device = mockDevice();
    const upsample = createStarAggregateUpsample(device, 'rgba16float');
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const halfResView = { __id: 'star-aggregates' } as unknown as GPUTextureView;
    upsample.draw(pass, halfResView);
    expect(pass.setPipeline).toHaveBeenCalledTimes(1);
    expect(pass.setBindGroup).toHaveBeenCalledWith(0, expect.anything());
    expect(pass.draw).toHaveBeenCalledWith(3, 1, 0, 0);

    const bindGroupDescs = (device as any).__bindGroupDescs as GPUBindGroupDescriptor[];
    expect(bindGroupDescs).toHaveLength(1);
    const entries = Array.from(bindGroupDescs[0]!.entries) as GPUBindGroupEntry[];
    expect(entries.find((e) => e.binding === 0)?.resource).toBe(halfResView);
  });

  it('destroy() does not throw', () => {
    const upsample = createStarAggregateUpsample(mockDevice(), 'rgba16float');
    expect(() => upsample.destroy()).not.toThrow();
  });
});
