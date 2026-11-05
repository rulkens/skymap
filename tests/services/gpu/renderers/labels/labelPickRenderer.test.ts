import { describe, expect, it, vi } from 'vitest';

import type { PickWindow } from '../../../../../src/@types/engine/frame/PickWindow';
import { createLabelPickRenderer } from '../../../../../src/services/gpu/renderers/labels/labelPickRenderer';

// The uniform and instance bytes are the renderer's only observable output, so
// the device records every writeBuffer and the test reads them back.
function build() {
  const uniformBuffer = { label: 'uniform', destroy: vi.fn() };
  const instanceBuffer = { label: 'instance', destroy: vi.fn() };
  const writes: { buffer: unknown; f32: Float32Array }[] = [];
  const device = {
    createBuffer: vi.fn((desc: GPUBufferDescriptor) =>
      desc.label === 'label-pick-uniform' ? uniformBuffer : instanceBuffer,
    ),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    queue: {
      writeBuffer: vi.fn(
        (buffer: unknown, _offset: number, data: ArrayBufferView | ArrayBuffer) => {
          const bytes = ArrayBuffer.isView(data) ? data.buffer : data;
          writes.push({ buffer, f32: new Float32Array(bytes).slice() });
        },
      ),
    },
  } as unknown as GPUDevice;
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
  const renderer = createLabelPickRenderer(device, 'depth24plus', false);
  const lastWrite = (buffer: unknown) => writes.filter((w) => w.buffer === buffer).at(-1)!.f32;
  return { renderer, pass, uniformBuffer, instanceBuffer, lastWrite };
}

const QUAD = { rect: { x0: 5, y0: 15, x1: 15, y1: 25 }, packedId: 7 };

describe('labelPickRenderer', () => {
  it('draw translates every rect by the window origin', () => {
    const { renderer, pass, instanceBuffer, lastWrite } = build();
    const window: PickWindow = { originPx: [10, 20], sizePx: [1, 1] };
    renderer.draw(pass, [QUAD], window);
    const f32 = lastWrite(instanceBuffer);
    expect(Array.from(f32.subarray(0, 4))).toEqual([-5, -5, 5, 5]);
  });

  it('draw writes the window size as the viewport uniform', () => {
    const { renderer, pass, uniformBuffer, lastWrite } = build();
    const window: PickWindow = { originPx: [10, 20], sizePx: [1, 1] };
    renderer.draw(pass, [QUAD], window);
    const f32 = lastWrite(uniformBuffer);
    expect(Array.from(f32.subarray(0, 2))).toEqual([1, 1]);
  });
});
