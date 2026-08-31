import { describe, it, expect, vi } from 'vitest';
import { createLabelRenderer } from '../../../../../src/services/gpu/renderers/labels/labelRenderer';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import type { LoadedFontAtlases } from '../../../../../src/@types/rendering/LoadedFontAtlases';

// Capturing mock device: records the render-pipeline descriptor so the
// colour-target format handed to the factory can be asserted at construction.
// The atlas-bitmap list is empty in the fixture, so the copyExternalImageToTexture
// upload loop is skipped and the texture stub only needs createView.
function newCapturingDevice(renderPipelines: GPURenderPipelineDescriptor[]) {
  return {
    createBindGroupLayout: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createPipelineLayout: vi.fn(() => ({})),
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
}

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

describe('LabelRenderer colour target', () => {
  it('bakes the given targetFormat, NOT ctx.format, into the pipeline colour target', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    // ctx.format and targetFormat deliberately differ, so a regression to
    // reading ctx.format (instead of the explicit targetFormat argument)
    // would fail this assertion.
    const ctx = {
      device: newCapturingDevice(renderPipelines),
      context: null as unknown as GPUCanvasContext,
      format: 'bgra8unorm' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    createLabelRenderer(ctx, 'rgba16float', FIXTURE_ATLASES);
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

describe('LabelRenderer occlusion variant', () => {
  it('builds both a plain single-BGL pipeline and a two-BGL occlusion pipeline', () => {
    // The plain path builds one BGL and a single-BGL pipeline layout; the
    // occludeAgainstScene path adds the group(1) coverage joint AND still builds
    // the plain pipeline, because `draw` falls back to it on a frame with no
    // scene colour (no body drew). A device-only pipeline-validation error
    // (wrong group count) never surfaces in a headless suite, so pin the
    // two-pipeline / two-layout shape structurally here.
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    const pipelineLayouts: GPUPipelineLayoutDescriptor[] = [];
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
      createRenderPipeline: vi.fn(() => ({})),
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

    // Two BGLs: the label BGL (shared by both pipelines) + the coverage BGL.
    expect(bindGroupLayouts).toHaveLength(2);
    // Two pipeline layouts: the plain single-BGL layout and the two-BGL
    // occlusion layout — the occlusion instance builds both and picks per-draw.
    expect(pipelineLayouts).toHaveLength(2);
    expect(Array.from(pipelineLayouts[0]!.bindGroupLayouts)).toHaveLength(1); // plain
    expect(Array.from(pipelineLayouts[1]!.bindGroupLayouts)).toHaveLength(2); // occlusion
  });
});

describe('LabelRenderer (CPU state)', () => {
  it('starts with zero glyphs to draw', () => {
    const r = newRenderer();
    expect(r.glyphCount()).toBe(0);
  });

  it('counts glyphs across all labels after setLabels', () => {
    const r = newRenderer();
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24, font: 'cormorant' },
      { id: 'b', worldPos: [1, 0, 0], text: 'AA', pixelSize: 24, font: 'cormorant' },
    ]);
    expect(r.glyphCount()).toBe(5);
    expect(r.labelCount()).toBe(2);
  });

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

// ── fontIndex packing test ────────────────────────────────────────────────
//
// Reaching into the renderer's packed glyph buffer would require
// exposing internals; instead we verify the layer-index lookup
// indirectly by counting glyphs across mixed-font labels.  Since
// FONTS has only `cormorant` at this point, every label resolves to
// fontIndex 0 — the test asserts the lookup works without throwing.
// A future second font would extend this test with a real index
// assertion.

describe('LabelRenderer fontIndex resolution', () => {
  it('accepts labels with the cormorant font without throwing', () => {
    const ctx = {
      device: null as unknown as GPUDevice,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    const r = createLabelRenderer(ctx, ctx.format, FIXTURE_ATLASES);
    expect(() =>
      r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 24, font: 'cormorant' }]),
    ).not.toThrow();
    expect(r.glyphCount()).toBe(1);
  });
});
