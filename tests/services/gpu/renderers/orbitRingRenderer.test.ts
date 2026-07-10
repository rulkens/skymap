/**
 * orbitRingRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `planetRenderer.test.ts`). These tests pin the `Renderer`
 * contract, the `draw(pass, instances, count)` arity, the GPU-instancing
 * mechanism (one `writeBuffer` of the caller's array + one
 * `drawIndexed(indexCount, count)`), the count guard, and — the part the
 * planetRenderer test was flagged for NOT doing — the FULL instance
 * attribute layout: every attribute's shaderLocation / offset / format is
 * asserted byte-for-byte against the WESL contract, plus the additive
 * depthless hdr pipeline profile (blend one/one, no depthStencil, cull none).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createOrbitRingRenderer,
  MAX_ORBITS,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../src/services/gpu/renderers/orbitRingRenderer';
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

describe('createOrbitRingRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() => createOrbitRingRenderer(mockDevice(), 'rgba16float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createOrbitRingRenderer(mockDevice(), 'rgba16float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('allocates an instance buffer sized MAX_ORBITS × 80 bytes', () => {
    const buffers: BufferDesc[] = [];
    createOrbitRingRenderer(mockDevice({ buffers }), 'rgba16float');
    const instance = buffers.find((b) => b.label === 'orbit-ring-instance-vbo');
    expect(instance).toBeDefined();
    expect(INSTANCE_STRIDE).toBe(80);
    expect(INSTANCE_FLOATS).toBe(20);
    expect(instance!.size).toBe(MAX_ORBITS * 80);
  });

  it('pins the FULL instance attribute layout — location / offset / format per attribute', () => {
    // The byte-for-byte contract with orbitRing/vertex.wesl: four MVP columns
    // at locations 1..4 (offsets 0/16/32/48), then the colour vec4 at
    // location 5 (offset 64). A drifted offset silently reads garbage on
    // real hardware, so every field is pinned here — the assertion the
    // planetRenderer review flagged as missing in its own test.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitRingRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    const desc = renderPipelines[0]!;
    const vbs = Array.from(desc.vertex.buffers!);
    expect(vbs).toHaveLength(2);

    // Buffer 0: per-vertex quad corner.
    expect(vbs[0]!.arrayStride).toBe(12);
    expect(vbs[0]!.stepMode ?? 'vertex').toBe('vertex');
    expect(Array.from(vbs[0]!.attributes)).toEqual([
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
    ]);

    // Buffer 1: the per-instance record.
    expect(vbs[1]!.arrayStride).toBe(INSTANCE_STRIDE);
    expect(vbs[1]!.stepMode).toBe('instance');
    expect(Array.from(vbs[1]!.attributes)).toEqual([
      { shaderLocation: 1, offset: 0, format: 'float32x4' }, // mvp col 0
      { shaderLocation: 2, offset: 16, format: 'float32x4' }, // mvp col 1
      { shaderLocation: 3, offset: 32, format: 'float32x4' }, // mvp col 2
      { shaderLocation: 4, offset: 48, format: 'float32x4' }, // mvp col 3
      { shaderLocation: 5, offset: 64, format: 'float32x4' }, // color + pad
    ]);
  });

  it('bakes the additive depthless hdr profile — one/one blend, no depthStencil, cull none', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitRingRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const desc = renderPipelines[0]!;
    const target = Array.from(desc.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    expect(target!.blend).toEqual({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
    // Depthless: the hdr target has no depth attachment; declaring a depth
    // format would be a validation error.
    expect(desc.depthStencil).toBeUndefined();
    // The orbital plane is viewed from both sides — never cull.
    expect(desc.primitive?.cullMode).toBe('none');
  });

  it('draw is callable with (pass, instances, count) and records ONE indexed draw', () => {
    const renderer = createOrbitRingRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);

    const pass = mockPass();
    const instances = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);
    expect(() => renderer.draw(pass, instances, 3)).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
    // drawIndexed(indexCount, instanceCount): 6 indices (two triangles),
    // second arg is the ring count.
    const call = (pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe(6);
    expect(call[1]).toBe(3);
  });

  it('draw does exactly one writeBuffer of the caller`s array with count × 20 float elements', () => {
    const device = mockDevice();
    const renderer = createOrbitRingRenderer(device, 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear(); // drop the construction-time geometry uploads
    renderer.draw(pass, instances, 2);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Element counts (not bytes): 2 records × 20 floats.
    expect(size).toBe(2 * INSTANCE_FLOATS);

    // Both vertex buffers bound (per-vertex corner + per-instance records).
    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      0, 1,
    ]);
    // No bind group — the pipeline reads nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('clamps an over-count to MAX_ORBITS and no-ops a zero count', () => {
    const device = mockDevice();
    const renderer = createOrbitRingRenderer(device, 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);
    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;

    // Over-count: clamp to MAX_ORBITS rather than read off the buffer end.
    writeMock.mockClear();
    renderer.draw(pass, instances, MAX_ORBITS + 5);
    expect((pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(MAX_ORBITS);
    expect(writeMock.mock.calls[0]![4]).toBe(MAX_ORBITS * INSTANCE_FLOATS);

    // Zero count: nothing uploaded, nothing drawn.
    writeMock.mockClear();
    (pass.drawIndexed as ReturnType<typeof vi.fn>).mockClear();
    renderer.draw(pass, instances, 0);
    expect(writeMock).not.toHaveBeenCalled();
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });
});
