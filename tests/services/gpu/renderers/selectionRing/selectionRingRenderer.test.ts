import { describe, it, expect, vi } from 'vitest';
import { createSelectionRingRenderer } from '../../../../../src/services/gpu/renderers/selectionRing/selectionRingRenderer';

// A mock device that records writeBuffer calls and hands back stub GPU
// objects, so the populated `draw` path (pipeline + buffers non-null) runs
// without a real WebGPU backend.
function newMockDeviceRenderer(
  targetFormat?: GPUTextureFormat,
  init?: { occludeAgainstScene?: boolean },
) {
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
    renderer: createSelectionRingRenderer(ctx, targetFormat ?? ctx.format, init),
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

describe('SelectionRingRenderer occlusion variant', () => {
  it('blends the occlusion pipeline PREMULTIPLIED — the contract sceneTransmittance depends on', () => {
    // `fragmentOcclude.wesl` returns `shadeRing(...) * sceneTransmittance(...)`:
    // one scalar scaling an already-premultiplied rgba. That is only a fade
    // under a `one` source factor. Flip this target to straight-alpha OVER
    // (`src-alpha`) and the hardware multiplies by alpha a SECOND time — the
    // ring crushes toward black instead of fading out, on a device only. The
    // shader can't state the requirement; this can.
    const { renderPipelines } = newMockDeviceRenderer(undefined, { occludeAgainstScene: true });
    const occlude = renderPipelines.find((p) => p.label?.includes('occlude'));
    const target = Array.from(occlude!.fragment!.targets!)[0]!;
    expect(target!.blend?.color.srcFactor).toBe('one');
    expect(target!.blend?.color.dstFactor).toBe('one-minus-src-alpha');
  });
});

describe('SelectionRingRenderer.draw', () => {
  it('is a no-op when selection is null', () => {
    const { renderer } = newMockDeviceRenderer();
    const pass = newPassSpy();
    renderer.draw(pass, new Float32Array(16), [1280, 720], 1000, null);
    expect(pass.setPipeline).not.toHaveBeenCalled();
    expect(pass.draw).not.toHaveBeenCalled();
  });

  it('writes the selection uniform and issues the 6-vertex draw', () => {
    const { renderer, writeBuffer } = newMockDeviceRenderer();
    const pass = newPassSpy();
    renderer.draw(pass, new Float32Array(16), [1280, 720], 1000, {
      worldPos: [1, 2, 3],
      ringRadiusPx: 40,
      alpha: 0.25,
    });

    // The selection buffer write carries ringRadiusPx at float offset 3 and the
    // layer's stroke opacity at 4 — the layout vertex.wesl forwards from.
    const selWrite = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as unknown as { label: string }).label === 'selection-ring-selection',
    );
    expect(selWrite).toBeDefined();
    const selData = selWrite![2];
    expect(selData[0]).toBe(1);
    expect(selData[1]).toBe(2);
    expect(selData[2]).toBe(3);
    expect(selData[3]).toBe(40);
    expect(selData[4]).toBe(0.25);

    expect(pass.setPipeline).toHaveBeenCalledOnce();
    expect(pass.draw).toHaveBeenCalledOnce();
    expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([6, 1, 0, 0]);
  });
});
