import { describe, it, expect, vi } from 'vitest';
import { createMilkyWayCloudRenderer } from '../../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer';
import { GEN_RECORD_BYTES } from '../../../../../src/services/engine/galaxyGenerator/v1/genRecordBytes';
import { MILKY_WAY_MODEL_SCALE } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { MilkyWayCloudBuffers } from '../../../../../src/@types/galaxy/MilkyWayCloudBuffers';
import type { MilkyWayCloudDrawArgs } from '../../../../../src/@types/rendering/MilkyWayCloudDrawArgs';

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

/**
 * Mutually-distinct tuning values, none equal to any calibration default, so
 * the uniform-packing test below can tell each lane apart — a knob written into
 * the wrong slot would silently change a different aspect of the look.
 * `aggregateDivisor` sizes the offscreen rather than riding the uniform buffer,
 * so it is here only to satisfy the type.
 */
const TUNING = {
  starSizeScale: 3.25,
  exposure: 0.017,
  starPxMin: 2.5,
  starPxMax: 96,
  softness: 0.75,
  lodApparent: 0.005,
  aggregateDivisor: 3,
  // Never read by the renderer (it feeds generation, not the uniform pack
  // this draw-args fixture exercises) — present only because `tuning` is
  // typed as the full `MilkyWayTuning` shape.
  starCount: 150000,
};

function drawArgs(withDust: boolean): MilkyWayCloudDrawArgs {
  return {
    vp: new Float32Array(16).fill(7),
    viewportPx: [1920, 1080],
    camRight: [1, 0, 0],
    camUp: [0, 1, 0],
    model: Float32Array.from({ length: 16 }, (_, i) => i + 100),
    fadeAlpha: 0.5,
    tuning: TUNING,
    buffers: buffers(withDust),
  };
}

describe('createMilkyWayCloudRenderer — pipeline blend states', () => {
  it('star pipeline blends one/one additive on color and alpha', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
    const star = findPipeline(createRenderPipeline, 'milkyWayCloud-star-pipeline');
    const blend = Array.from(star.fragment!.targets!)[0]!.blend!;
    expect(blend.color).toEqual({ srcFactor: 'one', dstFactor: 'one', operation: 'add' });
    expect(blend.alpha).toEqual({ srcFactor: 'one', dstFactor: 'one', operation: 'add' });
  });

  it('dust pipeline blends srcFactor dst / dstFactor zero on color and zero/one on alpha', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
    const dust = findPipeline(createRenderPipeline, 'milkyWayCloud-dust-pipeline');
    const blend = Array.from(dust.fragment!.targets!)[0]!.blend!;
    // The load-bearing multiply: src*dst on colour multiplies the sprite's
    // transmittance onto whatever light is already in the HDR target; the alpha
    // channel passes dst through (0*src + 1*dst) so it stays untouched.
    expect(blend.color).toEqual({ srcFactor: 'dst', dstFactor: 'zero', operation: 'add' });
    expect(blend.alpha).toEqual({ srcFactor: 'zero', dstFactor: 'one', operation: 'add' });
  });
});

describe('createMilkyWayCloudRenderer — colour target', () => {
  it('bakes the given targetFormat into both pipeline colour targets', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
    for (const label of ['milkyWayCloud-star-pipeline', 'milkyWayCloud-dust-pipeline']) {
      const desc = findPipeline(createRenderPipeline, label);
      const target = Array.from(desc.fragment!.targets!)[0]!;
      expect(target!.format).toBe('rgba16float');
    }
  });
});

describe('createMilkyWayCloudRenderer — vertex layout & depth', () => {
  it('both pipelines take the instance buffer at arrayStride GEN_RECORD_BYTES', () => {
    const { device, createRenderPipeline } = mockDevice();
    createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
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
    createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
    for (const label of ['milkyWayCloud-star-pipeline', 'milkyWayCloud-dust-pipeline']) {
      const desc = findPipeline(createRenderPipeline, label);
      expect(desc.depthStencil).toBeUndefined();
    }
  });
});

describe('createMilkyWayCloudRenderer — the two entry points', () => {
  // Stars and dust render into DIFFERENT targets (mw-aggregate vs hdr), so each
  // entry point must issue only its own pipeline — a star draw leaking into the
  // dust pass would put multiplicative-transmittance quads in the additive
  // offscreen, and vice versa. Their relative ORDER is CONTENT_LAYERS row
  // order (see passes/index.ts), not this module's concern.
  it('drawStars records only the star pipeline', () => {
    const { device } = mockDevice();
    const renderer = createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });

    const stars = mockPass();
    renderer.drawStars(stars.pass, drawArgs(true));
    expect(stars.events).toEqual([
      { kind: 'pipeline', label: 'milkyWayCloud-star-pipeline' },
      { kind: 'draw', instances: 5 },
    ]);
  });

  it('drawDust records only the dust pipeline, and is a no-op when dustBuf is null', () => {
    const { device } = mockDevice();
    const renderer = createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });

    const withDust = mockPass();
    renderer.drawDust(withDust.pass, drawArgs(true));
    expect(withDust.events).toEqual([
      { kind: 'pipeline', label: 'milkyWayCloud-dust-pipeline' },
      { kind: 'draw', instances: 3 },
    ]);

    // A generation that carved no dust layout must record nothing at all — not
    // even a pipeline bind, or the executor would open a pass for an empty draw.
    const noDust = mockPass();
    renderer.drawDust(noDust.pass, drawArgs(false));
    expect(noDust.events).toEqual([]);
  });

  // The two passes cannot share a uniform buffer: queue writes are ordered
  // against submit, not against the passes encoded between them, so a shared
  // buffer would give both passes whichever write landed last — silently
  // feeding the star pass the dust pass's (full-res) viewport.
  it('writes each pass its own uniform buffer', () => {
    const { device, writeBuffer } = mockDevice();
    const renderer = createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
    const { pass } = mockPass();

    renderer.drawStars(pass, drawArgs(true));
    renderer.drawDust(pass, drawArgs(true));

    const starTarget = writeBuffer.mock.calls[0]![0];
    const dustTarget = writeBuffer.mock.calls[1]![0];
    expect(starTarget).not.toBe(dustTarget);
  });
});

describe('createMilkyWayCloudRenderer — uniform packing', () => {
  it('packs model at f32 20..35, camRight at 36..39, and the params scalars', () => {
    const { device, writeBuffer } = mockDevice();
    const renderer = createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
    const { pass } = mockPass();
    const args = drawArgs(true);
    renderer.drawStars(pass, args);

    const payload = writeBuffer.mock.calls[0]![2] as Float32Array;
    const f32 =
      payload instanceof Float32Array
        ? payload
        : new Float32Array((payload as ArrayBufferView).buffer);

    // model matrix occupies f32 20..35.
    expect(Array.from(f32.slice(20, 36))).toEqual(Array.from(args.model));
    // camRight.xyz at 36..38 (39 is the vec4 pad).
    expect(Array.from(f32.slice(36, 39))).toEqual([1, 0, 0]);
    // params0 = (fadeAlpha, exposure, modelScale, softness). The four tuning
    // lanes carry the caller's LIVE settings values, not calibration
    // constants — that is what makes a DebugPanel slider take effect.
    expect(f32[44]).toBeCloseTo(0.5);
    expect(f32[45]).toBeCloseTo(TUNING.exposure);
    expect(f32[46]).toBeCloseTo(MILKY_WAY_MODEL_SCALE);
    expect(f32[47]).toBeCloseTo(TUNING.softness);
    // params1 = (starPxMin, starPxMax, starSizeScale, lodApparent).
    expect(f32[48]).toBeCloseTo(TUNING.starPxMin);
    expect(f32[49]).toBeCloseTo(TUNING.starPxMax);
    expect(f32[50]).toBeCloseTo(TUNING.starSizeScale);
    expect(f32[51]).toBeCloseTo(TUNING.lodApparent);
  });
});
