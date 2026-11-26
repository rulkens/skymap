/**
 * bloomPyramid — unit tests for the dual-filter bloom pyramid factory. Mocks
 * GPUDevice so the test runs in Vitest without a real GPU. Covers the two
 * behaviours that a type-check cannot and that a real bug would silently break:
 *
 *   - the writeBuffer/submit anti-race: every draw writes AND binds its OWN
 *     per-level uniform buffer, and the two stages use SEPARATE buffers even at
 *     the same level. Collapsing to a shared buffer (the classic mistake) would
 *     make one draw read another's texel size — invisible to tsc, caught here.
 *   - upsample and fold blend additively, band subtracts; bright, downsample,
 *     streak and veil overwrite. Flipping either side would sum successive
 *     frames into garbage or drop the pyramid's accumulation.
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
 * Run a method and return the uniform buffer its `nth` draw WROTE and the buffer
 * it BOUND at binding 2. The anti-race property is that these are the same object
 * for a draw, and different objects across draws that must not share.
 */
function drawAndCapture(
  ctx: ReturnType<typeof mockDevice>,
  record: () => void,
  nth = 0,
): { written: unknown; bound: unknown } {
  const beforeWrites = ctx.writes.length;
  const beforeBinds = ctx.bindGroupDescs.length;
  record();
  const written = ctx.writes[beforeWrites + nth]!.buffer;
  const desc = ctx.bindGroupDescs[beforeBinds + nth]!;
  const entries = Array.from(desc.entries) as GPUBindGroupEntry[];
  const bound = (entries.find((e) => e.binding === 2)!.resource as GPUBufferBinding).buffer;
  return { written, bound };
}

describe('createBloomPyramid', () => {
  it('upsample and fold blend additively, band reverse-subtracts; bright, downsample, streak and veil overwrite', () => {
    const ctx = mockDevice();
    createBloomPyramid(ctx.device, 'rgba16float');
    const blendOf = (stage: string) =>
      (
        ctx.renderPipelineDescs.find((d) => d.label === `bloomPyramid-${stage}-pipeline`)!
          .fragment as GPUFragmentState
      ).targets![0]!.blend;
    for (const stage of ['bright', 'downsample', 'streak', 'veil']) {
      expect(blendOf(stage)).toBeUndefined();
    }
    for (const stage of ['upsample', 'fold']) {
      expect(blendOf(stage)).toEqual({
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      });
    }
    expect(blendOf('band')).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'reverse-subtract' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'reverse-subtract' },
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
    const folds = (['bloom', 'streak', 'veil'] as const).map((kind) =>
      drawAndCapture(ctx, () => bloom.fold(pass, view, kind, 1)),
    );
    const taps = { texel: 0.01, stride: 1, threshold: 0, falloff: 48, tint: 0.7 };
    const streaks = ([0, 1, 2] as const).map((iteration) =>
      drawAndCapture(ctx, () => bloom.streak(pass, view, iteration, taps)),
    );
    const veils = (['x', 'y'] as const).map((axis) =>
      drawAndCapture(ctx, () => bloom.veil(pass, view, axis, [0.1, 0.1])),
    );
    // band's copy draw runs the fold pipeline, so it must not reuse a fold's buffer.
    const bands = [0, 1].map((nth) =>
      drawAndCapture(ctx, () => bloom.band(pass, view, view, [0.1, 0.1]), nth),
    );
    const all = [d1, d2, u3, d3, ...folds, ...streaks, ...veils, ...bands];

    // Each draw binds exactly the buffer it wrote — no read of a sibling's write.
    for (const d of all) expect(d.bound).toBe(d.written);
    // No two draws of one frame share a buffer, including downsample and
    // upsample at the SAME level (3), the race the two-array split prevents.
    expect(new Set(all.map((d) => d.written)).size).toBe(all.length);
  });

  it('destroy() releases the uniform buffers without throwing', () => {
    const ctx = mockDevice();
    const bloom = createBloomPyramid(ctx.device, 'rgba16float');
    expect(() => bloom.destroy()).not.toThrow();
  });
});
