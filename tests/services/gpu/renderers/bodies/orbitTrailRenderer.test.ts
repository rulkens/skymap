/**
 * orbitTrailRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in. These
 * tests pin the `Renderer` contract, the widened 40-float / 160-byte instance
 * record (locations 1..10, the ribbon impostor's clip-basis addition at
 * 8/9/10), the two-pipeline-one-module-one-VBO construction (ribbon vs
 * fullscreen fallback, sharing `fsModule`), the partitioned two-draw `draw`
 * call (`draw(pass, instances, ribbonCount, fallbackCount)` — ribbon records
 * at the front of the shared VBO, fallback records at the back via
 * `firstInstance`), the count guard, the grow-on-slots instance buffer, and
 * the additive depthless hdr pipeline profile shared by both pipelines.
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
    expect(INSTANCE_STRIDE).toBe(160);
    expect(INSTANCE_FLOATS).toBe(40);
  });

  it('pins the FULL instance attribute layout — ONE instance buffer, no position VBO', () => {
    // The byte-for-byte contract with orbitTrail/io.wesl's OrbitInstance:
    // three Ginv columns at locations 1..3 (offsets 0/16/32), then
    // colour+eccentricity at location 4 (offset 48), meanAnomaly+fade at
    // location 5 (offset 64), the two gradient-minor triples at locations
    // 6/7 (offsets 80/96), and the ribbon impostor's clip-basis vec4s
    // Cc/Ac/Bc at locations 8/9/10 (offsets 112/128/144). Neither pipeline
    // has a location-0 position buffer — both generate geometry from
    // @builtin(vertex_index), so this instance buffer is the pipeline's
    // only vertex buffer. A drifted offset silently reads garbage on real
    // hardware, so every field is pinned here, for BOTH pipelines.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    expect(renderPipelines).toHaveLength(2);

    const expectedAttributes = [
      { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv col 0
      { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv col 1
      { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv col 2
      { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color + eccentricity
      { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomaly + fade + pad
      { shaderLocation: 6, offset: 80, format: 'float32x4' }, // gradient minors M1/M2/M3 + pad
      { shaderLocation: 7, offset: 96, format: 'float32x4' }, // gradient minors M4/M5/M6 + pad
      { shaderLocation: 8, offset: 112, format: 'float32x4' }, // clip basis centre Cc
      { shaderLocation: 9, offset: 128, format: 'float32x4' }, // clip basis semi-major Ac
      { shaderLocation: 10, offset: 144, format: 'float32x4' }, // clip basis semi-minor Bc
    ];

    for (const desc of renderPipelines) {
      const vbs = Array.from(desc.vertex.buffers!);
      expect(vbs).toHaveLength(1);
      expect(vbs[0]!.arrayStride).toBe(INSTANCE_STRIDE);
      expect(vbs[0]!.stepMode).toBe('instance');
      expect(Array.from(vbs[0]!.attributes)).toEqual(expectedAttributes);
    }
  });

  it('builds a ribbon pipeline and a fullscreen pipeline from one fragment module', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    expect(renderPipelines).toHaveLength(2);

    const ribbon = renderPipelines.find((d) => d.vertex.entryPoint === 'vsRibbon');
    const fallback = renderPipelines.find((d) => d.vertex.entryPoint === 'vs');
    expect(ribbon).toBeDefined();
    expect(fallback).toBeDefined();
    // Same fragment module instance shared by both pipelines.
    expect(ribbon!.fragment!.module).toBe(fallback!.fragment!.module);
  });

  it('bakes the additive depthless hdr profile — one/one blend, no depthStencil, cull none — for BOTH pipelines', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createOrbitTrailRenderer(mockDevice({ renderPipelines }), 'rgba16float');
    expect(renderPipelines).toHaveLength(2);

    for (const desc of renderPipelines) {
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
    }
  });

  it('draw is callable with (pass, instances, ribbonCount, fallbackCount)', () => {
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(4);
  });

  it('issues the ribbon draw for the ribbon count and the fullscreen draw for the fallback count', () => {
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    const pass = mockPass();
    const slots = 10;
    const instances = new Float32Array(slots * INSTANCE_FLOATS);
    const ribbonCount = 3;
    const fallbackCount = 4;

    renderer.draw(pass, instances, ribbonCount, fallbackCount);

    const calls = (pass.draw as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // Ribbon: RIBBON_SEGMENTS * 6 verts, ribbonCount instances, firstInstance 0.
    expect(calls[0]).toEqual([RIBBON_SEGMENTS * 6, ribbonCount, 0, 0]);
    // Fallback: 3 verts (fullscreen triangle), fallbackCount instances,
    // firstInstance = slots - fallbackCount (the back of the shared VBO).
    expect(calls[1]).toEqual([3, fallbackCount, 0, slots - fallbackCount]);
  });

  it('a zero count skips its own draw', () => {
    const slots = 5;
    const makeInstances = () => new Float32Array(slots * INSTANCE_FLOATS);

    // Only ribbon count is nonzero — exactly one draw call.
    {
      const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
      const pass = mockPass();
      renderer.draw(pass, makeInstances(), 2, 0);
      expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
      expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(RIBBON_SEGMENTS * 6);
    }

    // Only fallback count is nonzero — exactly one draw call.
    {
      const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
      const pass = mockPass();
      renderer.draw(pass, makeInstances(), 0, 2);
      expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
      expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(3);
    }

    // Both zero — the whole call is a no-op, including the upload.
    {
      const device = mockDevice();
      const renderer = createOrbitTrailRenderer(device, 'rgba16float');
      const pass = mockPass();
      const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
      writeMock.mockClear();
      renderer.draw(pass, makeInstances(), 0, 0);
      expect(pass.draw).not.toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    }
  });

  it('draw does exactly one writeBuffer covering every slot, and sets the vertex buffer once', () => {
    const device = mockDevice();
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const slots = 6;
    const instances = new Float32Array(slots * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear();
    renderer.draw(pass, instances, 2, 3);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Every slot uploads, including the unwritten middle (1 ribbon-eligible +
    // fallback slots don't fill all 6, but the whole packed array covers both
    // partitions — no compaction pass).
    expect(size).toBe(instances.length);

    // Exactly one vertex buffer bound, even though two draws are issued.
    expect((pass.setVertexBuffer as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(
      [0],
    );
    // No bind group — the pipelines read nothing from the uniform space.
    expect(pass.setBindGroup).not.toHaveBeenCalled();
  });

  it('the trail buffer grows past the initial capacity, sized on total slots', () => {
    // Regression coverage for the MAX_ORBITS = 24 defect (pre-ribbon): the
    // buffer itself has no cap — it grows to whatever slots = instances.length
    // / INSTANCE_FLOATS demands, the same grow-only-reuse pattern
    // starPointRenderer.setStars uses for its instance buffer. Sized on
    // SLOTS, not on either draw count, since both partitions read one buffer.
    const buffers: BufferDesc[] = [];
    const device = mockDevice({ buffers });
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();

    // First draw establishes an initial capacity of 3 slots.
    renderer.draw(pass, new Float32Array(3 * INSTANCE_FLOATS), 1, 2);
    const afterFirst = buffers.filter((b) => b.label === 'orbit-trail-instance-vbo');
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.size).toBe(3 * INSTANCE_STRIDE);

    // A later draw asking for more slots than that capacity must grow the
    // buffer (a second allocation), not truncate to the first one's size.
    renderer.draw(pass, new Float32Array(7 * INSTANCE_FLOATS), 3, 4);
    const afterSecond = buffers.filter((b) => b.label === 'orbit-trail-instance-vbo');
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[1]!.size).toBe(7 * INSTANCE_STRIDE);
    // The grown draw actually issues all instances — nothing dropped.
    const drawCalls = (pass.draw as ReturnType<typeof vi.fn>).mock.calls;
    expect(drawCalls.at(-2)![1]).toBe(3); // ribbon count
    expect(drawCalls.at(-1)![1]).toBe(4); // fallback count
  });

  it('the impostor overlay draws the hull and the fallback wash only when enabled', () => {
    // debug.showOrbitTrailImpostor: the debug pipeline pair builds LAZILY on
    // first `true` (production pays nothing while the flag stays false), and
    // the extra draws reuse the SAME vertex counts / firstInstance offsets as
    // the production pair — the overlay is a lens over the real geometry, not
    // an independently-derived footprint.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    const device = mockDevice({ renderPipelines });
    const renderer = createOrbitTrailRenderer(device, 'rgba16float');
    const pass = mockPass();
    const slots = 10;
    const instances = new Float32Array(slots * INSTANCE_FLOATS);
    const ribbonCount = 3;
    const fallbackCount = 4;

    // Flag omitted (defaults false) — only the two production pipelines exist,
    // and only the two production draws are issued.
    renderer.draw(pass, instances, ribbonCount, fallbackCount);
    expect(renderPipelines).toHaveLength(2);
    expect((pass.draw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);

    (pass.draw as ReturnType<typeof vi.fn>).mockClear();

    // Flag true — the two debug pipelines are built now (first enable), and
    // exactly two ADDITIONAL draws land, matching the production pair's
    // vertex counts and firstInstance offsets exactly.
    renderer.draw(pass, instances, ribbonCount, fallbackCount, true);
    expect(renderPipelines).toHaveLength(4);
    const calls = (pass.draw as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual([RIBBON_SEGMENTS * 6, ribbonCount, 0, 0]);
    expect(calls[1]).toEqual([3, fallbackCount, 0, slots - fallbackCount]);
    expect(calls[2]).toEqual([RIBBON_SEGMENTS * 6, ribbonCount, 0, 0]);
    expect(calls[3]).toEqual([3, fallbackCount, 0, slots - fallbackCount]);

    // A later enabled call does not rebuild the debug pipelines again.
    renderer.draw(pass, instances, ribbonCount, fallbackCount, true);
    expect(renderPipelines).toHaveLength(4);
  });

  it('counts that overrun the packed array throw', () => {
    // A count pair the caller's own packed array cannot back is a
    // programming error, not a runtime condition to paper over — it must
    // throw at the call site instead of reading past the array or silently
    // drawing fewer instances than asked.
    const renderer = createOrbitTrailRenderer(mockDevice(), 'rgba16float');
    const pass = mockPass();
    const instances = new Float32Array(4 * INSTANCE_FLOATS); // only 4 slots
    expect(() => renderer.draw(pass, instances, 3, 3)).toThrow(); // 6 > 4
    expect(() => renderer.draw(pass, instances, -1, 2)).toThrow(); // negative
    expect(() => renderer.draw(pass, instances, 2, -1)).toThrow(); // negative
  });
});
