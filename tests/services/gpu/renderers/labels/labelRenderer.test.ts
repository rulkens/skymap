import { describe, it, expect, vi } from 'vitest';
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
// array stays empty so the renderer's GPU upload branch is skipped
// (we pass a null device anyway).
const FIXTURE_ATLASES: LoadedFontAtlases = {
  metricsByFont: { cormorant: FIXTURE_METRICS },
  bitmaps: [],
};

// Build a LabelRenderer with a null device — the factory guards all GPU
// calls behind `if (device)`, so CPU state is safe to exercise in unit
// tests without a real WebGPU context.  Mirrors `textureAtlas.test.ts`'s
// null-device pattern.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return createLabelRenderer(ctx, ctx.format, FIXTURE_ATLASES);
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
    createLabelRenderer(ctx, ctx.format, FIXTURE_ATLASES, 64, 64, {
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

describe('LabelRenderer (CPU state)', () => {
  it('drops glyphs not present in metrics', () => {
    const r = newRenderer();
    // 'A中A' — 'A' is in metrics (id=65), '中' is not (id=20013).  We
    // expect only the two 'A' glyphs to be counted; the unknown
    // character is silently skipped.
    r.setLabels([{ id: 'x', worldPos: [0, 0, 0], text: 'A中A', pixelSize: 24, font: 'cormorant' }]);
    expect(r.glyphCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLabels', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 24, font: 'cormorant' }]);
    r.setLabels([{ id: 'b', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24, font: 'cormorant' }]);
    expect(r.labelCount()).toBe(1);
    expect(r.glyphCount()).toBe(3);
  });
});

function makeLabel(id: string): Label2D {
  return { id, worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' };
}

describe('LabelRenderer capacity growth', () => {
  // Tracks descriptors by their `label` field so an assertion can tell the
  // construction-time buffer/bind-group apart from a growth-time one without
  // hardcoding byte sizes derived from private constants.
  function buildTrackingDevice() {
    const createBufferCalls: GPUBufferDescriptor[] = [];
    const createBindGroupCalls: GPUBindGroupDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({})),
      createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
        createBufferCalls.push(desc);
        return { destroy: vi.fn() };
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
    return { ctx, createBufferCalls, createBindGroupCalls };
  }

  it('grows the CPU roster past its initial capacity with no truncation', () => {
    const r = createLabelRenderer(
      {
        device: null as unknown as GPUDevice,
        context: null as unknown as GPUCanvasContext,
        format: 'rgba16float' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      FIXTURE_ATLASES,
      4,
    );

    r.setLabels([1, 2, 3, 4, 5].map((n) => makeLabel(`l${n}`)));

    expect(r.labelCount()).toBe(5);
    expect(r.packedLabels()).toHaveLength(5);
  });

  it('reallocates the GPU storage/instance buffers and rebinds when the roster outgrows capacity', () => {
    const { ctx, createBufferCalls, createBindGroupCalls } = buildTrackingDevice();
    const r = createLabelRenderer(ctx, ctx.format, FIXTURE_ATLASES, 4, 4);
    const bindGroupCallsAtConstruction = createBindGroupCalls.length;

    r.setLabels([1, 2, 3, 4, 5].map((n) => makeLabel(`l${n}`)));

    expect(createBindGroupCalls.length).toBeGreaterThan(bindGroupCallsAtConstruction);
    const storageCalls = createBufferCalls.filter((d) => d.label === 'label-storage');
    expect(storageCalls).toHaveLength(2);
    expect(storageCalls[1]!.size).toBeGreaterThan(storageCalls[0]!.size);
    const instanceCalls = createBufferCalls.filter((d) => d.label === 'label-instances');
    expect(instanceCalls).toHaveLength(2);
    expect(instanceCalls[1]!.size).toBeGreaterThan(instanceCalls[0]!.size);
  });
});
