/**
 * planetRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `earthRenderer.test.ts`). These tests pin the `Renderer`
 * contract (non-empty `label`, `destroy`), the `draw(pass, instances, count)`
 * arity, the GPU-instancing mechanism (one `writeBuffer` of the caller's
 * array + one `drawIndexed(indexCount, count)`, so one draw paints N planets
 * without the writeBuffer-vs-submit race), the count guard, and the opaque
 * foreground pipeline profile (caller's `targetFormat` on the colour target,
 * depth state present).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createPlanetRenderer,
  MAX_PLANETS,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../src/services/gpu/renderers/planetRenderer';
import type { Renderer } from '../../../../src/@types/rendering/Renderer';

type BufferDesc = { label?: string; size: number };

function mockDevice(opts?: {
  renderPipelines?: GPURenderPipelineDescriptor[];
  buffers?: BufferDesc[];
}): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((desc: BufferDesc) => {
      opts?.buffers?.push(desc);
      return { destroy: vi.fn() };
    }),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      opts?.renderPipelines?.push(desc);
      return {};
    }),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

function mockPass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

describe('createPlanetRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() => createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('allocates an instance buffer sized MAX_PLANETS × 80 bytes', () => {
    const buffers: BufferDesc[] = [];
    createPlanetRenderer(mockDevice({ buffers }), 'rgba16float', 'depth32float');
    const instance = buffers.find((b) => b.label === 'planet-instance-vbo');
    expect(instance).toBeDefined();
    expect(INSTANCE_STRIDE).toBe(80);
    expect(instance!.size).toBe(MAX_PLANETS * 80);
  });

  it('draw is callable with (pass, instances, count) and records ONE indexed draw', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float');
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);

    const pass = mockPass();
    const instances = new Float32Array(MAX_PLANETS * INSTANCE_FLOATS);
    expect(() => renderer.draw(pass, instances, 2)).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
    // drawIndexed(indexCount, instanceCount): second arg is the planet count.
    expect((pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(2);
  });

  it('draw does exactly one writeBuffer of the caller`s array with count × 20 float elements', () => {
    const device = mockDevice();
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float');
    const pass = mockPass();
    const instances = new Float32Array(MAX_PLANETS * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear(); // drop the construction-time geometry uploads
    renderer.draw(pass, instances, 3);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Element counts (not bytes): 3 records × 20 floats.
    expect(size).toBe(3 * INSTANCE_FLOATS);

    // Both vertex buffers bound (per-vertex position + per-instance records).
    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      0, 1,
    ]);
    // No bind group — the pipeline reads nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('clamps an over-count to MAX_PLANETS and no-ops a zero count', () => {
    const device = mockDevice();
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float');
    const pass = mockPass();
    const instances = new Float32Array(MAX_PLANETS * INSTANCE_FLOATS);
    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;

    // Over-count: clamp to MAX_PLANETS rather than read off the buffer end.
    writeMock.mockClear();
    renderer.draw(pass, instances, MAX_PLANETS + 5);
    expect((pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(MAX_PLANETS);
    expect(writeMock.mock.calls[0]![4]).toBe(MAX_PLANETS * INSTANCE_FLOATS);

    // Zero count: nothing uploaded, nothing drawn.
    writeMock.mockClear();
    (pass.drawIndexed as ReturnType<typeof vi.fn>).mockClear();
    renderer.draw(pass, instances, 0);
    expect(writeMock).not.toHaveBeenCalled();
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('bakes the opaque foreground profile — targetFormat colour target + depth state', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createPlanetRenderer(mockDevice({ renderPipelines }), 'rgba16float', 'depth32float');
    expect(renderPipelines).toHaveLength(1);
    const desc = renderPipelines[0]!;
    const target = Array.from(desc.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    // Opaque replace — no blend descriptor on the colour target.
    expect(target!.blend).toBeUndefined();
    expect(desc.depthStencil).toMatchObject({
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    });
    // Two vertex buffers: per-vertex position (stride 12) + per-instance
    // records (stride 80, instance-stepped).
    const vbs = Array.from(desc.vertex.buffers!);
    expect(vbs).toHaveLength(2);
    expect(vbs[1]!.stepMode).toBe('instance');
    expect(vbs[1]!.arrayStride).toBe(INSTANCE_STRIDE);
  });
});
