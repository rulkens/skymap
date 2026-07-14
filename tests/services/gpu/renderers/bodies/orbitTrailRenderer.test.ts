/**
 * orbitTrailRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in. These
 * tests pin the `Renderer` contract, the
 * `draw(pass, instances, count)` arity, the GPU-instancing mechanism (one
 * `writeBuffer` of the caller's array + one `draw(3, count)`), the count guard,
 * and — the divergence from the ring twin — the FULL single-instance-buffer
 * attribute layout: the fullscreen triangle means there is NO per-vertex
 * position buffer, so the instance record is the pipeline's only vertex buffer,
 * with every attribute's shaderLocation / offset / format asserted byte-for-byte
 * against the WESL contract, plus the additive depthless hdr pipeline profile
 * (blend one/one, no depthStencil, cull none).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createOrbitTrailRenderer,
  MAX_ORBITS,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../../src/services/gpu/renderers/bodies/orbitTrailRenderer';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';

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
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

describe('createOrbitTrailRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() => createOrbitTrailRenderer(mockDevice(), 'rgba16float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('allocates an instance buffer sized MAX_ORBITS × 80 bytes', () => {
    const buffers: BufferDesc[] = [];
    createOrbitTrailRenderer(mockDevice({ buffers }), 'rgba16float');
    const instance = buffers.find((b) => b.label === 'orbit-trail-instance-vbo');
    expect(instance).toBeDefined();
    expect(INSTANCE_STRIDE).toBe(80);
    expect(INSTANCE_FLOATS).toBe(20);
    expect(instance!.size).toBe(MAX_ORBITS * 80);
  });

  it('pins the FULL instance attribute layout — ONE instance buffer, no position VBO', () => {
    // The byte-for-byte contract with orbitTrail/vertex.wesl: three Ginv
    // columns at locations 1..3 (offsets 0/16/32), then colour+eccentricity at
    // location 4 (offset 48) and meanAnomaly+pad at location 5 (offset 64). The
    // fullscreen triangle is generated from @builtin(vertex_index), so there is
    // NO location-0 position buffer — the instance record is the pipeline's
    // only vertex buffer. A drifted offset silently reads garbage on real
    // hardware, so every field is pinned here.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    const desc = renderPipelines[0]!;
    const vbs = Array.from(desc.vertex.buffers!);
    expect(vbs).toHaveLength(1);

    expect(vbs[0]!.arrayStride).toBe(INSTANCE_STRIDE);
    expect(vbs[0]!.stepMode).toBe('instance');
    expect(Array.from(vbs[0]!.attributes)).toEqual([
      { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv col 0
      { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv col 1
      { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv col 2
      { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color + eccentricity
      { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomaly + pad
    ]);
  });

  it('bakes the additive depthless hdr profile — one/one blend, no depthStencil, cull none', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
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

  it('draw is callable with (pass, instances, count) and records ONE draw(3, count)', () => {
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);

    const pass = mockPass();
    const instances = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);
    expect(() => renderer.draw(pass, instances, 3)).not.toThrow();
    expect(pass.draw).toHaveBeenCalledTimes(1);
    // draw(vertexCount, instanceCount): 3 verts (the fullscreen triangle),
    // second arg is the orbit count.
    const call = (pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe(3);
    expect(call[1]).toBe(3);
  });

  it('draw does exactly one writeBuffer of the callers array with count × 20 float elements', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear();
    renderer.draw(pass, instances, 2);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Element counts (not bytes): 2 records × 20 floats.
    expect(size).toBe(2 * INSTANCE_FLOATS);

    // Exactly one vertex buffer bound (the per-instance records — no position
    // buffer, since the triangle is generated in the vertex shader).
    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      0,
    ]);
    // No bind group — the pipeline reads nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('clamps an over-count to MAX_ORBITS and no-ops a zero count', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(MAX_ORBITS * INSTANCE_FLOATS);
    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;

    // Over-count: clamp to MAX_ORBITS rather than read off the buffer end.
    writeMock.mockClear();
    renderer.draw(pass, instances, MAX_ORBITS + 5);
    expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(MAX_ORBITS);
    expect(writeMock.mock.calls[0]![4]).toBe(MAX_ORBITS * INSTANCE_FLOATS);

    // Zero count: nothing uploaded, nothing drawn.
    writeMock.mockClear();
    (pass.draw as ReturnType<typeof vi.fn>).mockClear();
    renderer.draw(pass, instances, 0);
    expect(writeMock).not.toHaveBeenCalled();
    expect(pass.draw).not.toHaveBeenCalled();
  });
});
