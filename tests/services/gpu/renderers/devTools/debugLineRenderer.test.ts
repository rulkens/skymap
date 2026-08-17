import { describe, it, expect, vi } from 'vitest';
import { createDebugLineRenderer } from '../../../../../src/services/gpu/renderers/devTools/debugLineRenderer';
import type { DebugLine } from '../../../../../src/@types/rendering/DebugLine';

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

// Build a DebugLineRenderer with a null device — like markerLineRenderer, the
// factory guards every GPU call behind `if (device)`, so CPU-side line-count
// state is safe to exercise without a real WebGPU context.
const newRenderer = (maxLines?: number) => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return createDebugLineRenderer(ctx, ctx.format, maxLines);
};

const line = (): DebugLine => ({ from: [0, 0, 0], to: [0, 1, 0], width: 3, color: [1, 0, 0, 1] });

describe('DebugLineRenderer colour target', () => {
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
    createDebugLineRenderer(ctx, 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

describe('DebugLineRenderer (CPU state)', () => {
  it('starts with zero lines', () => {
    expect(newRenderer().lineCount()).toBe(0);
  });

  it('counts lines after setLines', () => {
    const r = newRenderer();
    r.setLines([line(), line()]);
    expect(r.lineCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLines', () => {
    const r = newRenderer();
    r.setLines([line()]);
    r.setLines([line(), line(), line()]);
    expect(r.lineCount()).toBe(3);
  });

  it('clears on setLines([])', () => {
    const r = newRenderer();
    r.setLines([line(), line()]);
    r.setLines([]);
    expect(r.lineCount()).toBe(0);
  });

  it('caps at maxLines', () => {
    const r = newRenderer(2);
    r.setLines([line(), line(), line()]);
    expect(r.lineCount()).toBe(2);
  });
});
