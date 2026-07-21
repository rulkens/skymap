/**
 * bloomPyramid — unit tests for the dual-filter bloom pyramid factory. Mocks
 * GPUDevice so the test runs in Vitest without a real GPU. Covers the two
 * behaviours that a type-check cannot and that a real bug would silently break:
 *
 *   - the writeBuffer/submit anti-race: every draw writes AND binds its OWN
 *     per-level uniform buffer, and the two stages use SEPARATE buffers even at
 *     the same level. Collapsing to a shared buffer (the classic mistake) would
 *     make one draw read another's texel size — invisible to tsc, caught here.
 *   - only the upsample pipeline blends additively; bright + downsample
 *     overwrite. Flipping either would sum successive mips into garbage or drop
 *     the pyramid's accumulation.
 */
import { describe, it, expect, vi } from 'vitest';
import { createBloomPyramid } from '../../../../src/services/gpu/passes/bloomPyramid';

function mockDevice() {
  const renderPipelineDescs: GPURenderPipelineDescriptor[] = [];
  const writes: { buffer: unknown }[] = [];
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  const device = {
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelineDescs.push(desc);
      return {};
    }),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ __label: desc.label, destroy: vi.fn() })),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
    queue: { writeBuffer: vi.fn((buffer: unknown) => writes.push({ buffer })) },
  };
  return { device: device as unknown as GPUDevice, renderPipelineDescs, writes, bindGroupDescs };
}

function mockPass() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

/**
 * Run a single draw and return the uniform buffer it WROTE and the buffer it
 * BOUND at binding 2. The anti-race property is that these are the same object
 * for a draw, and different objects across draws that must not share.
 */
function drawAndCapture(
  ctx: ReturnType<typeof mockDevice>,
  record: () => void,
): { written: unknown; bound: unknown } {
  const beforeWrites = ctx.writes.length;
  const beforeBinds = ctx.bindGroupDescs.length;
  record();
  const written = ctx.writes[beforeWrites]!.buffer;
  const desc = ctx.bindGroupDescs[beforeBinds]!;
  const entries = Array.from(desc.entries) as GPUBindGroupEntry[];
  const bound = (entries.find((e) => e.binding === 2)!.resource as GPUBufferBinding).buffer;
  return { written, bound };
}

describe('createBloomPyramid', () => {
  it('only the upsample pipeline blends additively', () => {
    const ctx = mockDevice();
    createBloomPyramid(ctx.device, 'rgba16float');
    // Pipelines are built in order: bright, downsample, upsample.
    const [bright, down, up] = ctx.renderPipelineDescs.map(
      (d) => (d.fragment as GPUFragmentState).targets![0]!.blend,
    );
    expect(bright).toBeUndefined();
    expect(down).toBeUndefined();
    expect(up).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
  });

  it('each draw writes and binds its own per-level uniform buffer', () => {
    const ctx = mockDevice();
    const bloom = createBloomPyramid(ctx.device, 'rgba16float');
    const pass = mockPass();
    const view = {} as GPUTextureView;

    const d1 = drawAndCapture(ctx, () => bloom.downsample(pass, view, 1, [0.5, 0.5], true));
    const d2 = drawAndCapture(ctx, () => bloom.downsample(pass, view, 2, [0.25, 0.25], false));
    const u3 = drawAndCapture(ctx, () => bloom.upsample(pass, view, 3, [0.1, 0.1]));
    const d3 = drawAndCapture(ctx, () => bloom.downsample(pass, view, 3, [0.05, 0.05], false));

    // Each draw binds exactly the buffer it wrote — no read of a sibling's write.
    for (const d of [d1, d2, u3, d3]) expect(d.bound).toBe(d.written);
    // Distinct downsample levels never share a buffer.
    expect(d1.written).not.toBe(d2.written);
    // Downsample and upsample at the SAME level (3) use separate buffers — the
    // race the two-array split exists to prevent.
    expect(d3.written).not.toBe(u3.written);
  });

  it('destroy() releases the uniform buffers without throwing', () => {
    const ctx = mockDevice();
    const bloom = createBloomPyramid(ctx.device, 'rgba16float');
    expect(() => bloom.destroy()).not.toThrow();
  });
});
