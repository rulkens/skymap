import { describe, it, expect, vi } from 'vitest';
import {
  createMilkyWayCloudRenderer,
  MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
} from '../../../../src/services/gpu/renderers/milkyWayCloudRenderer';
import { GEN_RECORD_BYTES } from '../../../../src/services/gpu/galaxy/genRecordBytes';
import {
  MILKY_WAY_EXPOSURE,
  MILKY_WAY_MODEL_SCALE,
  MILKY_WAY_STAR_PX_MIN,
  MILKY_WAY_STAR_PX_MAX,
  MILKY_WAY_STAR_SIZE_SCALE,
} from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import type { MilkyWayCloudBuffers } from '../../../../src/@types/galaxy/MilkyWayCloudBuffers';
import type { MilkyWayCloudDrawArgs } from '../../../../src/@types/rendering/MilkyWayCloudDrawArgs';

/**
 * The pipeline descriptors the renderer hands to `createRenderPipeline`, keyed
 * by the label we assert against. The mock records the whole descriptor so a
 * test can inspect the blend state, vertex-buffer layout, and depthStencil of
 * either pipeline by name (`'milkyWayCloud-star-pipeline'` /
 * `'milkyWayCloud-dust-pipeline'`) rather than relying on call order.
 */
type PipelineDesc = GPURenderPipelineDescriptor & { label: string };

function mockDevice() {
  const writeBuffer = vi.fn<(buffer: GPUBuffer, offset: number, data: BufferSource) => void>();
  // Each pipeline mock carries its own label so setPipeline order can be read
  // back by label, and its own getBindGroupLayout so the renderer can build one
  // bind group per pipeline (the auto-layout-doesn't-cross-pipelines rule).
  const createRenderPipeline = vi.fn((desc: PipelineDesc) => ({
    label: desc.label,
    getBindGroupLayout: vi.fn(() => ({})),
  }));
  const device = {
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
      getMappedRange: () => new ArrayBuffer(48),
      unmap: vi.fn(),
    })),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroup: vi.fn(() => ({})),
    createRenderPipeline,
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  return { device, createRenderPipeline, writeBuffer };
}

/**
 * A pass encoder that records the ordered sequence of setPipeline / draw calls
 * so the stars-before-dust ordering (and the dust skip) can be asserted.
 */
function mockPass(): {
  pass: GPURenderPassEncoder;
  events: Array<{ kind: 'pipeline'; label: string } | { kind: 'draw'; instances: number }>;
} {
  const events: Array<{ kind: 'pipeline'; label: string } | { kind: 'draw'; instances: number }> =
    [];
  const pass = {
    setPipeline: vi.fn((p: { label: string }) => events.push({ kind: 'pipeline', label: p.label })),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn((_verts: number, instances: number) => events.push({ kind: 'draw', instances })),
  } as unknown as GPURenderPassEncoder;
  return { pass, events };
}

function findPipeline(
  createRenderPipeline: { mock: { calls: readonly unknown[][] } },
  label: string,
): PipelineDesc {
  const call = createRenderPipeline.mock.calls.find((c) => (c[0] as PipelineDesc).label === label);
  if (call === undefined) throw new Error(`no pipeline created with label ${label}`);
  return call[0] as PipelineDesc;
}

const starBuf = { destroy: vi.fn() } as unknown as GPUBuffer;
const dustBuf = { destroy: vi.fn() } as unknown as GPUBuffer;

function buffers(withDust: boolean): MilkyWayCloudBuffers {
  return { starBuf, starCount: 5, dustBuf: withDust ? dustBuf : null, dustCount: withDust ? 3 : 0 };
}

function drawArgs(withDust: boolean): MilkyWayCloudDrawArgs {
  return {
    vp: new Float32Array(16).fill(7),
    viewportPx: [1920, 1080],
    camRight: [1, 0, 0],
    camUp: [0, 1, 0],
    model: Float32Array.from({ length: 16 }, (_, i) => i + 100),
    fadeAlpha: 0.5,
    buffers: buffers(withDust),
  };
}

describe('createMilkyWayCloudRenderer — pipeline blend states', () => {
  it('star pipeline blends one/one additive on color and alpha', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, format: 'rgba16float' });
    const star = findPipeline(createRenderPipeline, 'milkyWayCloud-star-pipeline');
    const blend = Array.from(star.fragment!.targets!)[0]!.blend!;
    expect(blend.color).toEqual({ srcFactor: 'one', dstFactor: 'one', operation: 'add' });
    expect(blend.alpha).toEqual({ srcFactor: 'one', dstFactor: 'one', operation: 'add' });
  });

  it('dust pipeline blends srcFactor dst / dstFactor zero on color and zero/one on alpha', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, format: 'rgba16float' });
    const dust = findPipeline(createRenderPipeline, 'milkyWayCloud-dust-pipeline');
    const blend = Array.from(dust.fragment!.targets!)[0]!.blend!;
    // The load-bearing multiply: src*dst on colour multiplies the sprite's
    // transmittance onto whatever light is already in the HDR target; the alpha
    // channel passes dst through (0*src + 1*dst) so it stays untouched.
    expect(blend.color).toEqual({ srcFactor: 'dst', dstFactor: 'zero', operation: 'add' });
    expect(blend.alpha).toEqual({ srcFactor: 'zero', dstFactor: 'one', operation: 'add' });
  });
});

describe('createMilkyWayCloudRenderer — vertex layout & depth', () => {
  it('both pipelines take the instance buffer at arrayStride GEN_RECORD_BYTES', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, format: 'rgba16float' });
    for (const label of ['milkyWayCloud-star-pipeline', 'milkyWayCloud-dust-pipeline']) {
      const desc = findPipeline(createRenderPipeline, label);
      // Slot 0 is the shared corner quad (stride 8); slot 1 is the per-instance
      // generated record.
      const instanceLayout = Array.from(desc.vertex.buffers!)[1]!;
      expect(instanceLayout.arrayStride).toBe(GEN_RECORD_BYTES);
      expect(instanceLayout.stepMode).toBe('instance');
    }
  });

  it('neither pipeline declares depthStencil', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, format: 'rgba16float' });
    for (const label of ['milkyWayCloud-star-pipeline', 'milkyWayCloud-dust-pipeline']) {
      const desc = findPipeline(createRenderPipeline, label);
      expect(desc.depthStencil).toBeUndefined();
    }
  });
});

describe('createMilkyWayCloudRenderer — draw ordering', () => {
  it('records stars before dust, and skips dust when dustBuf is null', () => {
    const { device } = mockDevice();
    const renderer = createMilkyWayCloudRenderer({ device, format: 'rgba16float' });

    const withDust = mockPass();
    renderer.draw(withDust.pass, drawArgs(true));
    expect(withDust.events).toEqual([
      { kind: 'pipeline', label: 'milkyWayCloud-star-pipeline' },
      { kind: 'draw', instances: 5 },
      { kind: 'pipeline', label: 'milkyWayCloud-dust-pipeline' },
      { kind: 'draw', instances: 3 },
    ]);

    const noDust = mockPass();
    renderer.draw(noDust.pass, drawArgs(false));
    expect(noDust.events).toEqual([
      { kind: 'pipeline', label: 'milkyWayCloud-star-pipeline' },
      { kind: 'draw', instances: 5 },
    ]);
  });
});

describe('createMilkyWayCloudRenderer — uniform packing', () => {
  it('packs model at f32 20..35, camRight at 36..39, and the params scalars', () => {
    const { device, writeBuffer } = mockDevice();
    const renderer = createMilkyWayCloudRenderer({ device, format: 'rgba16float' });
    const { pass } = mockPass();
    const args = drawArgs(true);
    renderer.draw(pass, args);

    const payload = writeBuffer.mock.calls[0]![2] as Float32Array;
    const f32 =
      payload instanceof Float32Array
        ? payload
        : new Float32Array((payload as ArrayBufferView).buffer);

    // model matrix occupies f32 20..35.
    expect(Array.from(f32.slice(20, 36))).toEqual(Array.from(args.model));
    // camRight.xyz at 36..38 (39 is the vec4 pad).
    expect(Array.from(f32.slice(36, 39))).toEqual([1, 0, 0]);
    // params0 = (fadeAlpha, exposure, modelScale, 0).
    expect(f32[44]).toBeCloseTo(0.5);
    expect(f32[45]).toBeCloseTo(MILKY_WAY_EXPOSURE);
    expect(f32[46]).toBeCloseTo(MILKY_WAY_MODEL_SCALE);
    // params1 = (starPxMin, starPxMax, starSizeScale, 0).
    expect(f32[48]).toBeCloseTo(MILKY_WAY_STAR_PX_MIN);
    expect(f32[49]).toBeCloseTo(MILKY_WAY_STAR_PX_MAX);
    expect(f32[50]).toBeCloseTo(MILKY_WAY_STAR_SIZE_SCALE);
  });

  it('uniform buffer is 208 bytes', () => {
    expect(MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE).toBe(208);
  });
});
