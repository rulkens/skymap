import { describe, it, expect, vi } from 'vitest';
import { createMarkerLineRenderer } from '../../../../../src/services/gpu/renderers/labels/markerLineRenderer';

// Capturing mock device: records the render-pipeline descriptor so the
// colour-target format handed to the factory can be asserted at construction.
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
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

// Build a MarkerLineRenderer with a null device — the factory guards all GPU
// calls behind `if (device)`, so CPU state is safe to exercise in unit
// tests without a real WebGPU context.  This mirrors `labelRenderer.test.ts`'s
// null-device pattern.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return createMarkerLineRenderer(ctx, ctx.format);
};

describe('MarkerLineRenderer colour target', () => {
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
    createMarkerLineRenderer(ctx, 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

describe('MarkerLineRenderer occlusion variant', () => {
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
      createBindGroup: vi.fn(() => ({})),
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;

    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    createMarkerLineRenderer(ctx, ctx.format, 64, { occludeAgainstScene: true });
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

    // Two BGLs: the marker-line BGL (shared by both pipelines) + the coverage BGL.
    expect(bindGroupLayouts).toHaveLength(2);
    // Two pipeline layouts: the plain single-BGL layout and the two-BGL
    // occlusion layout — the occlusion instance builds both and picks per-draw.
    expect(pipelineLayouts).toHaveLength(2);
    expect(Array.from(pipelineLayouts[0]!.bindGroupLayouts)).toHaveLength(1); // plain
    expect(Array.from(pipelineLayouts[1]!.bindGroupLayouts)).toHaveLength(2); // occlusion
  });

  it('blends the occlusion pipeline PREMULTIPLIED — the contract sceneTransmittance depends on', () => {
    // See labelRenderer.test.ts's twin for the mechanism: `shadeLine(...) *
    // sceneTransmittance(...)` is a scalar on premultiplied rgba, which only
    // reads as a fade under a `one` source factor.
    const { renderPipelines } = buildOccluding();
    const occlude = renderPipelines.find((p) => p.label?.includes('occlude'));
    const target = Array.from(occlude!.fragment!.targets!)[0]!;
    expect(target!.blend?.color.srcFactor).toBe('one');
    expect(target!.blend?.color.dstFactor).toBe('one-minus-src-alpha');
  });
});

describe('MarkerLineRenderer (CPU state)', () => {
  it('starts with zero lines', () => {
    const r = newRenderer();
    expect(r.lineCount()).toBe(0);
  });

  it('counts lines after setLines', () => {
    const r = newRenderer();
    r.setLines([
      { id: 'a', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
      { id: 'b', fromWorld: [1, 0, 0], toWorld: [1, 2, 0], pixelWidth: 1.5, color: [1, 0, 0, 1] },
    ]);
    expect(r.lineCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLines', () => {
    const r = newRenderer();
    r.setLines([
      { id: 'a', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
    ]);
    r.setLines([
      { id: 'b', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
      { id: 'c', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
      { id: 'd', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 2, color: [1, 1, 1, 1] },
    ]);
    expect(r.lineCount()).toBe(3);
  });

  it('caps at maxLines', () => {
    const ctx = {
      device: null as unknown as GPUDevice,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    const r = createMarkerLineRenderer(ctx, ctx.format, 2);
    r.setLines([
      { id: 'a', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
      { id: 'b', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
      { id: 'c', fromWorld: [0, 0, 0], toWorld: [0, 1, 0], pixelWidth: 1, color: [1, 1, 1, 1] },
    ]);
    expect(r.lineCount()).toBe(2);
  });
});
