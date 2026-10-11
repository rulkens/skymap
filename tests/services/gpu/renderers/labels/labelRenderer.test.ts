import { describe, it, expect, vi } from 'vitest';
import { LABEL_DATA_BYTES } from '../../../../../src/data/labels/labelBufferStrides';
import { createLabelRenderer } from '../../../../../src/services/gpu/renderers/labels/labelRenderer';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import type { LoadedFontAtlases } from '../../../../../src/@types/rendering/LoadedFontAtlases';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';

// Minimal BMFont fixture: just the uppercase A (codepoint 65) so we can
// test that the renderer counts known glyphs and silently drops
// unknown ones.
const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 0,
      yoffset: 0,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
  ],
});

// LoadedFontAtlases shape: one entry per registered FontId; bitmaps
// array stays empty so the renderer's GPU upload branch is skipped.
const FIXTURE_ATLASES: LoadedFontAtlases = {
  metricsByFont: { cormorant: FIXTURE_METRICS },
  bitmaps: [],
};

describe('LabelRenderer occlusion variant', () => {
  // The factory's descriptors are the only observable surface here — a device
  // that records them is what makes pipeline shape and blend state assertable
  // without WebGPU.
  function buildOccluding() {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    const pipelineLayouts: GPUPipelineLayoutDescriptor[] = [];
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
        bindGroupLayouts.push(desc);
        return {};
      }),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn((desc: GPUPipelineLayoutDescriptor) => {
        pipelineLayouts.push(desc);
        return {};
      }),
      createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
        renderPipelines.push(desc);
        return {};
      }),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
      createSampler: vi.fn(() => ({})),
      createBindGroup: vi.fn(() => ({})),
      queue: { writeBuffer: vi.fn(), copyExternalImageToTexture: vi.fn() },
    } as unknown as GPUDevice;

    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    createLabelRenderer(ctx, {
      targetFormat: ctx.format,
      atlases: FIXTURE_ATLASES,
      occludeAgainstScene: true,
    });
    return { bindGroupLayouts, pipelineLayouts, renderPipelines };
  }

  it('builds both a plain single-BGL pipeline and a two-BGL occlusion pipeline', () => {
    // The plain path builds one BGL and a single-BGL pipeline layout; the
    // occludeAgainstScene path adds the group(1) coverage joint AND still builds
    // the plain pipeline, because `draw` falls back to it on a frame with no
    // scene colour (no body drew). A device-only pipeline-validation error
    // (wrong group count) never surfaces in a headless suite, so pin the
    // two-pipeline / two-layout shape structurally here.
    const { bindGroupLayouts, pipelineLayouts } = buildOccluding();

    // Two BGLs: the label BGL (shared by both pipelines) + the coverage BGL.
    expect(bindGroupLayouts).toHaveLength(2);
    // Two pipeline layouts: the plain single-BGL layout and the two-BGL
    // occlusion layout — the occlusion instance builds both and picks per-draw.
    expect(pipelineLayouts).toHaveLength(2);
    expect(Array.from(pipelineLayouts[0]!.bindGroupLayouts)).toHaveLength(1); // plain
    expect(Array.from(pipelineLayouts[1]!.bindGroupLayouts)).toHaveLength(2); // occlusion
  });

  it('draws the occlusion pipeline through vsOcclude, never vs — vs must stay clear of group(1)', () => {
    // vertex.wesl's 'vs' cannot statically reference lib::sceneDepth's group(1)
    // bindings (the plain pipeline's layout has none), so the occlusion
    // pipeline's vertex stage MUST come from the separate vertexOcclude.wesl
    // module's 'vsOcclude' entry — a device-only pipeline-validation error
    // (group(1) used but not in the layout) never surfaces in this headless
    // suite, so pin the entry point here.
    const { renderPipelines } = buildOccluding();
    const plain = renderPipelines.find((p) => p.label === 'label-pipeline');
    const occlude = renderPipelines.find((p) => p.label === 'label-pipeline-occlude');
    expect(plain!.vertex.entryPoint).toBe('vs');
    expect(occlude!.vertex.entryPoint).toBe('vsOcclude');
  });

  it('blends the occlusion pipeline PREMULTIPLIED — the contract sceneTransmittance depends on', () => {
    // `fragmentOcclude.wesl` returns `shade(...) * sceneTransmittance(...)`:
    // one scalar scaling an already-premultiplied rgba. That is only a fade
    // under a `one` source factor. Flip this target to the compositor's
    // straight-alpha OVER (`src-alpha`) and the hardware multiplies by alpha a
    // SECOND time — captions crush toward black instead of fading out, on a
    // device only. The shader can't state the requirement; this can.
    const { renderPipelines } = buildOccluding();
    const occlude = renderPipelines.find((p) => p.label?.includes('occlude'));
    const target = Array.from(occlude!.fragment!.targets!)[0]!;
    expect(target!.blend?.color.srcFactor).toBe('one');
    expect(target!.blend?.color.dstFactor).toBe('one-minus-src-alpha');
  });
});

function makeLabel(id: string): Label2D {
  return { id, worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' };
}

describe('LabelRenderer capacity growth', () => {
  // Tracks descriptors by their `label` field so an assertion can tell the
  // construction-time buffer/bind-group apart from a growth-time one without
  // hardcoding byte sizes derived from private constants.
  // Each createBuffer call returns a DISTINCT object (never a shared stub) so
  // growth assertions can tell the pre- and post-reallocation buffer apart by
  // identity — the thing the bind group must reference correctly.
  type TrackedBuffer = { desc: GPUBufferDescriptor; buffer: { destroy: ReturnType<typeof vi.fn> } };

  function buildTrackingDevice() {
    const createdBuffers: TrackedBuffer[] = [];
    const createBindGroupCalls: GPUBindGroupDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({})),
      createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
        const buffer = { destroy: vi.fn() };
        createdBuffers.push({ desc, buffer });
        return buffer;
      }),
      createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
      createSampler: vi.fn(() => ({})),
      createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
        createBindGroupCalls.push(desc);
        return {};
      }),
      queue: { writeBuffer: vi.fn(), copyExternalImageToTexture: vi.fn() },
    } as unknown as GPUDevice;

    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    return { ctx, createdBuffers, createBindGroupCalls };
  }

  it('writes clipScale into the uniform tail after the 80-byte camera prefix', () => {
    const { ctx, createdBuffers } = buildTrackingDevice();
    const r = createLabelRenderer(ctx, {
      targetFormat: ctx.format,
      atlases: FIXTURE_ATLASES,
    });
    r.setLabels([makeLabel('a')]);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const uniformBuffer = createdBuffers.find((b) => b.desc.label === 'label-uniforms')!;
    const writeBuffer = ctx.device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    const lastUniformWrite = () =>
      writeBuffer.mock.calls
        .filter((c) => c[0] === uniformBuffer.buffer)
        .at(-1)![2] as Float32Array;

    r.draw(pass, new Float32Array(16), [1280, 720], 1000);
    expect(lastUniformWrite()[20]).toBe(1);
    r.draw(pass, new Float32Array(16), [1280, 720], 1000, { clipScale: 3 });
    expect(lastUniformWrite()[20]).toBe(3);
  });

  it('reallocates the GPU storage/instance buffers and rebinds when the roster outgrows capacity', () => {
    const { ctx, createdBuffers, createBindGroupCalls } = buildTrackingDevice();
    const r = createLabelRenderer(ctx, {
      targetFormat: ctx.format,
      atlases: FIXTURE_ATLASES,
    });
    const bindGroupCallsAtConstruction = createBindGroupCalls.length;

    // 65 crosses INITIAL_LABEL_CAPACITY (64); the next power of two is 128,
    // so both buffers must exactly double.
    const labels = Array.from({ length: 65 }, (_, i) => makeLabel(`l${i}`));
    r.setLabels(labels);

    expect(createBindGroupCalls.length).toBeGreaterThan(bindGroupCallsAtConstruction);
    const storageBuffers = createdBuffers.filter((b) => b.desc.label === 'label-storage');
    expect(storageBuffers).toHaveLength(2);
    expect(storageBuffers[1]!.desc.size).toBe(storageBuffers[0]!.desc.size * 2);
    const instanceBuffers = createdBuffers.filter((b) => b.desc.label === 'label-instances');
    expect(instanceBuffers).toHaveLength(2);
    expect(instanceBuffers[1]!.desc.size).toBe(instanceBuffers[0]!.desc.size * 2);

    // The landmine this test exists for: binding 1 must point at the NEW
    // storage buffer, not a bind group rebuilt against the destroyed one.
    const lastBindGroup = createBindGroupCalls[createBindGroupCalls.length - 1]!;
    const entries = Array.from(lastBindGroup.entries) as GPUBindGroupEntry[];
    const binding1 = entries.find((e) => e.binding === 1)!;
    expect((binding1.resource as GPUBufferBinding).buffer).toBe(storageBuffers[1]!.buffer);

    // No truncation: the upload after growth covers all 65 labels' f32s.
    const writeBuffer = ctx.device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    const storageWrite = writeBuffer.mock.calls.find((c) => c[0] === storageBuffers[1]!.buffer)!;
    expect(storageWrite[4]).toBe((65 * LABEL_DATA_BYTES) / 4);

    expect(storageBuffers[0]!.buffer.destroy).toHaveBeenCalled();
    expect(instanceBuffers[0]!.buffer.destroy).toHaveBeenCalled();
  });
});
