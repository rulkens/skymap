import { describe, it, expect, vi } from 'vitest';
import { createMarkerLineRenderer } from '../../../../src/services/gpu/renderers/markerLineRenderer';

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
    };
    createMarkerLineRenderer(ctx, 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
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
