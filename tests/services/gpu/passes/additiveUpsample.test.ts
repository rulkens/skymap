/**
 * additiveUpsample — unit tests for the offscreen-to-HDR upsample pass
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
import { createAdditiveUpsample } from '../../../../src/services/gpu/passes/additiveUpsample';

function mockDevice(): GPUDevice {
  const renderPipelineDescs: GPURenderPipelineDescriptor[] = [];
  const samplerDescs: GPUSamplerDescriptor[] = [];
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
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
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
    queue: { writeBuffer: vi.fn() },
    // Test-only escape hatches: expose what the factory created.
    __renderPipelineDescs: renderPipelineDescs,
    __samplerDescs: samplerDescs,
    __bindGroupDescs: bindGroupDescs,
  } as unknown as GPUDevice;
}

describe('createAdditiveUpsample', () => {
  it('builds a pipeline with additive blend for color and alpha', () => {
    const device = mockDevice();
    createAdditiveUpsample(device, 'rgba16float');
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
    createAdditiveUpsample(device, 'rgba16float');
    const samplers = (device as any).__samplerDescs as GPUSamplerDescriptor[];
    expect(samplers).toHaveLength(1);
    expect(samplers[0]!.magFilter).toBe('linear');
    expect(samplers[0]!.minFilter).toBe('linear');
  });

  it('draw() records setPipeline, setBindGroup(0, ...), draw(3, 1, 0, 0) with halfResView bound', () => {
    const device = mockDevice();
    const upsample = createAdditiveUpsample(device, 'rgba16float');
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    // Use a sentinel object so we can identify the view inside the
    // captured bind-group descriptor.
    const halfResView = { __id: 'half-res' } as unknown as GPUTextureView;
    upsample.draw(pass, halfResView);
    expect(pass.setPipeline).toHaveBeenCalledTimes(1);
    // Bind group goes into slot 0 (the only slot the layout declares).
    expect(pass.setBindGroup).toHaveBeenCalledWith(0, expect.anything());
    // Three-vertex covering triangle, single instance.  See module
    // header for the why-not-a-quad rationale.
    expect(pass.draw).toHaveBeenCalledWith(3, 1, 0, 0);

    // The bind group built by this draw must reference the passed-in
    // half-res view — otherwise a future refactor could silently bind
    // a stale view from closure state without breaking the call-count
    // assertions above.
    const bindGroupDescs = (device as any).__bindGroupDescs as GPUBindGroupDescriptor[];
    expect(bindGroupDescs).toHaveLength(1);
    const entries = Array.from(bindGroupDescs[0]!.entries) as GPUBindGroupEntry[];
    const textureEntry = entries.find((e) => e.binding === 0);
    expect(textureEntry?.resource).toBe(halfResView);
  });

  it('destroy() does not throw', () => {
    const device = mockDevice();
    const upsample = createAdditiveUpsample(device, 'rgba16float');
    expect(() => upsample.destroy()).not.toThrow();
  });
});
