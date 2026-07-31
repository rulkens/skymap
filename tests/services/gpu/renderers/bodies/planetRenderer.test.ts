/**
 * planetRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `earthRenderer.test.ts`). These tests pin the `Renderer`
 * contract (non-empty `label`, `destroy`), the `draw(pass, instances, count)`
 * arity, the GPU-instancing mechanism (one `writeBuffer` of the caller's
 * array + one `drawIndexed(indexCount, count)`, so one draw paints N planets
 * without the writeBuffer-vs-submit race), the count guard, the grow-on-demand
 * instance buffer (no fixed cap — see the module header), and the opaque
 * foreground pipeline profile (caller's `targetFormat` on the colour target,
 * depth state present).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createPlanetRenderer,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../../src/services/gpu/renderers/bodies/planetRenderer';
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
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

describe('createPlanetRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() =>
      createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float', false),
    ).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('allocates the geometry buffers but no instance buffer at construction', () => {
    // Position + index geometry is fixed-size (one uv-sphere mesh) and
    // allocated eagerly. The instance buffer has nothing to size against
    // until a caller says how many planets it has — deferred to the first
    // draw, mirroring starPointRenderer's setStars.
    const buffers: BufferDesc[] = [];
    createPlanetRenderer(mockDevice({ buffers }), 'rgba16float', 'depth32float', false);
    expect(buffers.find((b) => b.label === 'planet-position-vbo')).toBeDefined();
    expect(buffers.find((b) => b.label === 'planet-index-ibo')).toBeDefined();
    expect(buffers.find((b) => b.label === 'planet-instance-vbo')).toBeUndefined();
    expect(INSTANCE_STRIDE).toBe(96);
  });

  it('draw is callable with (pass, instances, count) and records ONE indexed draw', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);

    const pass = mockPass();
    const instances = new Float32Array(2 * INSTANCE_FLOATS);
    expect(() => renderer.draw(pass, instances, 2)).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
    // drawIndexed(indexCount, instanceCount): second arg is the planet count.
    expect((pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(2);
  });

  it('draw does exactly one writeBuffer of the caller`s array with count × 24 float elements', () => {
    const device = mockDevice();
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();
    const instances = new Float32Array(5 * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear(); // drop the construction-time geometry uploads
    renderer.draw(pass, instances, 3);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Element counts (not bytes): 3 records × 24 floats.
    expect(size).toBe(3 * INSTANCE_FLOATS);

    // Both vertex buffers bound (per-vertex position + per-instance records).
    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      0, 1,
    ]);
    // No bind group — the pipeline reads nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('a zero count is a no-op', () => {
    const device = mockDevice();
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();
    const instances = new Float32Array(5 * INSTANCE_FLOATS);
    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;

    writeMock.mockClear();
    renderer.draw(pass, instances, 0);
    expect(writeMock).not.toHaveBeenCalled();
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('the planet buffer grows past the initial capacity', () => {
    // Regression coverage for the MAX_PLANETS = 24 defect: the planet table
    // used to outgrow the buffer silently (Math.min clamp). Now the buffer
    // itself has no cap — it grows to whatever the caller's count demands,
    // the same grow-only-reuse pattern starPointRenderer.setStars uses for
    // its instance buffer.
    const buffers: BufferDesc[] = [];
    const device = mockDevice({ buffers });
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();

    // First draw establishes an initial capacity of 3.
    renderer.draw(pass, new Float32Array(3 * INSTANCE_FLOATS), 3);
    const afterFirst = buffers.filter((b) => b.label === 'planet-instance-vbo');
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.size).toBe(3 * INSTANCE_STRIDE);

    // A later draw asking for more planets than that capacity must grow the
    // buffer (a second allocation), not truncate to the first one's size.
    renderer.draw(pass, new Float32Array(7 * INSTANCE_FLOATS), 7);
    const afterSecond = buffers.filter((b) => b.label === 'planet-instance-vbo');
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[1]!.size).toBe(7 * INSTANCE_STRIDE);
    // The grown draw actually issues all 7 instances — nothing dropped.
    const lastCall = (pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(lastCall[1]).toBe(7);
  });

  it('an over-count draw throws rather than silently truncating', () => {
    // The old clamp (Math.min(count, MAX_PLANETS)) hid a caller bug by
    // quietly dropping the tail of the batch — the exact "draw caps, pick
    // does not" asymmetry the backlog item named. A `count` the caller's own
    // packed array cannot back is a programming error, not a runtime
    // condition to paper over — it must throw at the call site instead of
    // reading past the array or silently drawing fewer planets than asked.
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    const pass = mockPass();
    const instances = new Float32Array(2 * INSTANCE_FLOATS); // only 2 records
    expect(() => renderer.draw(pass, instances, 5)).toThrow();
  });

  it('bakes the opaque foreground profile — targetFormat colour target + depth state', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createPlanetRenderer(mockDevice({ renderPipelines }), 'rgba16float', 'depth32float', false);
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
    // records (stride 96, instance-stepped).
    const vbs = Array.from(desc.vertex.buffers!);
    expect(vbs).toHaveLength(2);
    expect(vbs[1]!.stepMode).toBe('instance');
    expect(vbs[1]!.arrayStride).toBe(INSTANCE_STRIDE);
    // The vertex-stride keep-rule: sunDirLocal rides at @location(6), byte
    // offset 80 (four MVP columns 0..63 + albedo 64..79 + sunDir 80..95). This
    // MUST match planet/vertex.wesl's attribute or the shader reads garbage.
    const sunAttr = Array.from(vbs[1]!.attributes).find((a) => a.shaderLocation === 6);
    expect(sunAttr).toBeDefined();
    expect(sunAttr!.offset).toBe(80);
    expect(sunAttr!.format).toBe('float32x4');
  });
});
