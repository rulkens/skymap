import { describe, it, expect, vi } from 'vitest';
import { createSelectionRingRenderer } from '../../../../../src/services/gpu/renderers/selectionRing/selectionRingRenderer';

// Build a renderer with a null device — the factory guards all GPU calls
// behind `if (device)`, so the null-device no-op path is exercisable without
// WebGPU. Mirrors `markerLineRenderer.test.ts`.
const newNullDeviceRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return createSelectionRingRenderer(ctx, ctx.format);
};

// A mock device that records writeBuffer calls and hands back stub GPU
// objects, so the populated `draw` path (pipeline + buffers non-null) runs
// without a real WebGPU backend.
function newMockDeviceRenderer(targetFormat?: GPUTextureFormat) {
  const writeBuffer = vi.fn<(buffer: GPUBuffer, offset: number, data: Float32Array) => void>();
  const stubBuffer = (label: string) => ({ label, destroy: vi.fn() }) as unknown as GPUBuffer;
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  // Mirrors flowFieldRenderer.test.ts's mockDevice: the shader module must
  // expose getCompilationInfo (createShaderModuleWithDevLog calls it under DEV).
  const device = {
    createBindGroupLayout: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      return {};
    }),
    createBuffer: vi.fn((d: { label: string }) => stubBuffer(d.label)),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  const ctx = {
    device,
    context: null as unknown as GPUCanvasContext,
    format: 'bgra8unorm' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return {
    renderer: createSelectionRingRenderer(ctx, targetFormat ?? ctx.format),
    writeBuffer,
    renderPipelines,
  };
}

const newPassSpy = () =>
  ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  }) as unknown as GPURenderPassEncoder;

describe('SelectionRingRenderer colour target', () => {
  it('bakes the given targetFormat, NOT ctx.format, into the pipeline colour target', () => {
    // ctx.format ('bgra8unorm') and targetFormat ('rgba16float') deliberately
    // differ, so a regression to reading ctx.format instead of the explicit
    // targetFormat argument would fail this assertion.
    const { renderPipelines } = newMockDeviceRenderer('rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

describe('SelectionRingRenderer.draw', () => {
  it('is a no-op when selection is null', () => {
    const { renderer } = newMockDeviceRenderer();
    const pass = newPassSpy();
    renderer.draw(pass, new Float32Array(16), [1280, 720], null);
    expect(pass.setPipeline).not.toHaveBeenCalled();
    expect(pass.draw).not.toHaveBeenCalled();
  });

  it('is a no-op on a null device (no throw, never touches the encoder)', () => {
    const r = newNullDeviceRenderer();
    // Pass a null encoder to prove the early-return never touches it.
    r.draw(null as unknown as GPURenderPassEncoder, new Float32Array(16), [1280, 720], {
      worldPos: [1, 2, 3],
      ringRadiusPx: 40,
    });
  });

  it('writes the selection uniform and issues the 6-vertex draw', () => {
    const { renderer, writeBuffer } = newMockDeviceRenderer();
    const pass = newPassSpy();
    renderer.draw(pass, new Float32Array(16), [1280, 720], {
      worldPos: [1, 2, 3],
      ringRadiusPx: 40,
    });

    // The selection buffer write carries ringRadiusPx at float offset 3.
    const selWrite = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as unknown as { label: string }).label === 'selection-ring-selection',
    );
    expect(selWrite).toBeDefined();
    const selData = selWrite![2];
    expect(selData[0]).toBe(1);
    expect(selData[1]).toBe(2);
    expect(selData[2]).toBe(3);
    expect(selData[3]).toBe(40);

    expect(pass.setPipeline).toHaveBeenCalledOnce();
    expect(pass.draw).toHaveBeenCalledOnce();
    expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([6, 1, 0, 0]);
  });
});
