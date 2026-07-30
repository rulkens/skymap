/**
 * orbitTrailRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in. These
 * tests pin the `Renderer` contract, the
 * `draw(pass, instances, count)` arity, the GPU-instancing mechanism (one
 * `writeBuffer` of the caller's array + one `draw(3, count)`), the count guard,
 * the grow-on-demand instance buffer (no fixed cap — see the module header),
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

  it('allocates no instance buffer at construction — sizing is deferred to the first draw', () => {
    // Unlike a fixed MAX_ORBITS cap, there is nothing to size the buffer
    // against until a caller says how many orbits it has. Mirrors
    // starPointRenderer's setStars: no buffer exists until the first
    // non-empty call.
    const buffers: BufferDesc[] = [];
    createOrbitTrailRenderer(mockDevice({ buffers }), 'rgba16float');
    expect(buffers.find((b) => b.label === 'orbit-trail-instance-vbo')).toBeUndefined();
    expect(INSTANCE_STRIDE).toBe(112);
    expect(INSTANCE_FLOATS).toBe(28);
  });

  it('pins the FULL instance attribute layout — ONE instance buffer, no position VBO', () => {
    // The byte-for-byte contract with orbitTrail/vertex.wesl: three Ginv
    // columns at locations 1..3 (offsets 0/16/32), then colour+eccentricity at
    // location 4 (offset 48), meanAnomaly+fade at location 5 (offset 64), and
    // the two gradient-minor triples at locations 6/7 (offsets 80/96). The
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
      { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomaly + fade + pad
      { shaderLocation: 6, offset: 80, format: 'float32x4' }, // gradient minors M1/M2/M3 + pad
      { shaderLocation: 7, offset: 96, format: 'float32x4' }, // gradient minors M4/M5/M6 + pad
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
    const instances = new Float32Array(3 * INSTANCE_FLOATS);
    expect(() => renderer.draw(pass, instances, 3)).not.toThrow();
    expect(pass.draw).toHaveBeenCalledTimes(1);
    // draw(vertexCount, instanceCount): 3 verts (the fullscreen triangle),
    // second arg is the orbit count.
    const call = (pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe(3);
    expect(call[1]).toBe(3);
  });

  it('draw does exactly one writeBuffer of the callers array with count × 28 float elements', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(4 * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear();
    renderer.draw(pass, instances, 2);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Element counts (not bytes): 2 records × 28 floats.
    expect(size).toBe(2 * INSTANCE_FLOATS);

    // Exactly one vertex buffer bound (the per-instance records — no position
    // buffer, since the triangle is generated in the vertex shader).
    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      0,
    ]);
    // No bind group — the pipeline reads nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('a zero count is a no-op', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(4 * INSTANCE_FLOATS);
    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;

    writeMock.mockClear();
    renderer.draw(pass, instances, 0);
    expect(writeMock).not.toHaveBeenCalled();
    expect(pass.draw).not.toHaveBeenCalled();
  });

  it('the trail buffer grows past the initial capacity', () => {
    // Regression coverage for the MAX_ORBITS = 24 defect: the orbit table
    // used to outgrow the buffer silently (Math.min clamp). Now the buffer
    // itself has no cap — it grows to whatever the caller's count demands,
    // the same grow-only-reuse pattern starPointRenderer.setStars uses for
    // its instance buffer.
    const buffers: BufferDesc[] = [];
    const device = mockDevice({ buffers });
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();

    // First draw establishes an initial capacity of 3.
    renderer.draw(pass, new Float32Array(3 * INSTANCE_FLOATS), 3);
    const afterFirst = buffers.filter((b) => b.label === 'orbit-trail-instance-vbo');
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.size).toBe(3 * INSTANCE_STRIDE);

    // A later draw asking for more orbits than that capacity must grow the
    // buffer (a second allocation), not truncate to the first one's size.
    renderer.draw(pass, new Float32Array(7 * INSTANCE_FLOATS), 7);
    const afterSecond = buffers.filter((b) => b.label === 'orbit-trail-instance-vbo');
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[1]!.size).toBe(7 * INSTANCE_STRIDE);
    // The grown draw actually issues all 7 instances — nothing dropped.
    const lastDrawCall = (pass.draw as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(lastDrawCall[1]).toBe(7);
  });

  it('an over-count draw throws rather than silently truncating', () => {
    // The old clamp (Math.min(count, MAX_ORBITS)) hid a caller bug by
    // quietly dropping the tail of the batch. A `count` the caller's own
    // packed array cannot back is a programming error, not a runtime
    // condition to paper over — it must throw at the call site instead of
    // reading past the array or silently drawing fewer orbits than asked.
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(2 * INSTANCE_FLOATS); // only 2 records
    expect(() => renderer.draw(pass, instances, 5)).toThrow();
  });
});
