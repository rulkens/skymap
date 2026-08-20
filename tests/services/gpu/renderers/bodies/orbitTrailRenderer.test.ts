/**
 * orbitTrailRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in. These
 * tests pin the `Renderer` contract, the 34-float / 136-byte instance
 * record (locations 1..9, the ribbon impostor's clip-basis addition at
 * 6/7/8 and the visible-arc interval at 9), the one-pipeline-one-module-
 * one-VBO construction (every orbit is CPU-clipped to its in-front-of-
 * camera arc, so there is no fallback pipeline), the single-count `draw`
 * call (`draw(pass, instances, count)`), the count guard, the grow-on-slots
 * instance buffer, and the additive depthless hdr pipeline profile.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createOrbitTrailRenderer,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../../src/services/gpu/renderers/bodies/orbitTrailRenderer';
import { RIBBON_SEGMENTS } from '../../../../../src/data/bodies/orbitTrailConstants';
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
    // Unlike a fixed cap, there is nothing to size the buffer against until a
    // caller says how many slots it has. Mirrors starPointRenderer's
    // setStars: no buffer exists until the first non-empty call.
    const buffers: BufferDesc[] = [];
    createOrbitTrailRenderer(mockDevice({ buffers }), 'rgba16float');
    expect(buffers.find((b) => b.label === 'orbit-trail-instance-vbo')).toBeUndefined();
    expect(INSTANCE_STRIDE).toBe(136);
    expect(INSTANCE_FLOATS).toBe(34);
  });

  it('pins the FULL instance attribute layout — ONE instance buffer, no position VBO', () => {
    // The byte-for-byte contract with orbitTrail/io.wesl's OrbitInstance:
    // three Ginv columns at locations 1..3 (offsets 0/16/32), then
    // colour+eccentricity at location 4 (offset 48), meanAnomaly+fade+
    // viewportPx at location 5 (offset 64), and the ribbon impostor's clip-basis vec4s
    // Cc/Ac/Bc at locations 6/7/8 (offsets 80/96/112), then the CPU-clipped
    // visible arc at location 9 (offset 128). The pipeline has no
    // location-0 position buffer — geometry comes from
    // @builtin(vertex_index), so this instance buffer is the pipeline's only
    // vertex buffer. A drifted offset silently reads garbage on real
    // hardware, so every field is pinned here.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    expect(renderPipelines).toHaveLength(1);

    const expectedAttributes = [
      { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv col 0
      { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv col 1
      { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv col 2
      { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color + eccentricity
      { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomaly + fade + viewportPx
      { shaderLocation: 6, offset: 80, format: 'float32x4' }, // clip basis centre Cc
      { shaderLocation: 7, offset: 96, format: 'float32x4' }, // clip basis semi-major Ac
      { shaderLocation: 8, offset: 112, format: 'float32x4' }, // clip basis semi-minor Bc
      { shaderLocation: 9, offset: 128, format: 'float32x2' }, // visible arc eStart, eSpan
    ];

    const desc = renderPipelines[0]!;
    const vbs = Array.from(desc.vertex.buffers!);
    expect(vbs).toHaveLength(1);
    expect(vbs[0]!.arrayStride).toBe(INSTANCE_STRIDE);
    expect(vbs[0]!.stepMode).toBe('instance');
    expect(Array.from(vbs[0]!.attributes)).toEqual(expectedAttributes);
  });

  it('builds one production ribbon pipeline — vsRibbon + fs, no fallback pipeline', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    expect(renderPipelines[0]!.vertex.entryPoint).toBe('vsRibbon');
    expect(renderPipelines[0]!.fragment!.entryPoint).toBe('fs');
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

  it('draw is callable with (pass, instances, count)', () => {
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);
  });

  it('issues one ribbon draw for the whole count', () => {
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    const pass = mockPass();
    const slots = 10;
    const instances = new Float32Array(slots * INSTANCE_FLOATS);
    const count = 7;

    renderer.draw(pass, instances, count);

    const calls = (pass.draw as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    // RIBBON_SEGMENTS * 6 verts, `count` instances, firstInstance 0.
    expect(calls[0]).toEqual([RIBBON_SEGMENTS * 6, count, 0, 0]);
  });

  it('a zero count is a whole-call no-op, including the upload', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const slots = 5;
    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear();

    renderer.draw(pass, new Float32Array(slots * INSTANCE_FLOATS), 0);

    expect(pass.draw).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('draw does exactly one writeBuffer covering every slot, and sets the vertex buffer once', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const slots = 6;
    const instances = new Float32Array(slots * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear();
    renderer.draw(pass, instances, 4);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // The whole packed array uploads, including any unwritten tail slots.
    expect(size).toBe(instances.length);

    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(
      [0],
    );
    // No bind group — the pipeline reads nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('the trail buffer grows past the initial capacity, sized on total slots', () => {
    // Regression coverage for the MAX_ORBITS = 24 defect (pre-ribbon): the
    // buffer itself has no cap — it grows to whatever slots = instances.length
    // / INSTANCE_FLOATS demands, the same grow-only-reuse pattern
    // starPointRenderer.setStars uses for its instance buffer.
    const buffers: BufferDesc[] = [];
    const device = mockDevice({ buffers });
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();

    // First draw establishes an initial capacity of 3 slots.
    renderer.draw(pass, new Float32Array(3 * INSTANCE_FLOATS), 3);
    const afterFirst = buffers.filter((b) => b.label === 'orbit-trail-instance-vbo');
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.size).toBe(3 * INSTANCE_STRIDE);

    // A later draw asking for more slots than that capacity must grow the
    // buffer (a second allocation), not truncate to the first one's size.
    renderer.draw(pass, new Float32Array(7 * INSTANCE_FLOATS), 7);
    const afterSecond = buffers.filter((b) => b.label === 'orbit-trail-instance-vbo');
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[1]!.size).toBe(7 * INSTANCE_STRIDE);
    // The grown draw actually issues every instance — nothing dropped.
    const drawCalls = (pass.draw as ReturnType<typeof vi.fn>).mock.calls;
    expect(drawCalls.at(-1)![1]).toBe(7);
  });

  it('the impostor overlay draws the ribbon hull only when enabled', () => {
    // debug.overlays['orbit-trail-impostor']: the debug pipeline builds LAZILY on
    // first `true` (production pays nothing while the flag stays false), and
    // the extra draw reuses the SAME vertex count as the production draw —
    // the overlay is a lens over the real geometry, not an independently-
    // derived footprint.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    const device = mockDevice({ renderPipelines });
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const slots = 10;
    const instances = new Float32Array(slots * INSTANCE_FLOATS);
    const count = 7;

    // Flag omitted (defaults false) — only the one production pipeline
    // exists, and only the one production draw is issued.
    renderer.draw(pass, instances, count);
    expect(renderPipelines).toHaveLength(1);
    expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    (pass.draw as ReturnType<typeof vi.fn>).mockClear();

    // Flag true — the debug pipeline is built now (first enable), and
    // exactly one ADDITIONAL draw lands, matching the production draw's
    // vertex count exactly.
    renderer.draw(pass, instances, count, true);
    expect(renderPipelines).toHaveLength(2);
    const calls = (pass.draw as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([RIBBON_SEGMENTS * 6, count, 0, 0]);
    expect(calls[1]).toEqual([RIBBON_SEGMENTS * 6, count, 0, 0]);

    // A later enabled call does not rebuild the debug pipeline again.
    renderer.draw(pass, instances, count, true);
    expect(renderPipelines).toHaveLength(2);
  });

  it('a count that overruns the packed array throws', () => {
    // A count the caller's own packed array cannot back is a programming
    // error, not a runtime condition to paper over — it must throw at the
    // call site instead of reading past the array or silently drawing fewer
    // instances than asked.
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(4 * INSTANCE_FLOATS); // only 4 slots
    expect(() => renderer.draw(pass, instances, 5)).toThrow(); // 5 > 4
    expect(() => renderer.draw(pass, instances, -1)).toThrow(); // negative
  });
});
