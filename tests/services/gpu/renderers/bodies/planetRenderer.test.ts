/**
 * planetRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `earthRenderer.test.ts`). These tests pin the `Renderer`
 * contract (non-empty `label`, `destroy`), the `draw(pass, bodyId, instances,
 * count)` arity, the per-body instancing mechanism (one `writeBuffer` of the
 * caller's array into THAT body's own buffer + one `drawIndexed(indexCount,
 * count)`), the count guard, the grow-on-demand per-body instance buffer (no
 * fixed cap — see the module header), and the opaque foreground pipeline
 * profile (caller's `targetFormat` on the colour target, depth state
 * present).
 *
 * `bodyPickRenderer.test.ts` carries the load-bearing regression this file's
 * "own buffer per body" tests exist alongside: two same-submit `draw` calls
 * for DIFFERENT bodies must never share a write target (the writeBuffer-vs-
 * submit race `planetsLayer`'s per-row calls resurrected — see the module
 * header).
 *
 * The two failures worth pinning here are the silent ones, both cross-file
 * contracts with no compiler check: the vertex-attribute layout drifting from
 * the `@location` declarations in the linked WESL, and an `entryPoint` string
 * naming a function the shader no longer declares. Both fail only when a
 * browser builds the pipeline.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createPlanetRenderer,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../../src/services/gpu/renderers/bodies/planetRenderer';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';

type BufferDesc = { label?: string; size: number };

// Test-fixture body ids, cast the same way the real caller's do (`body.id as
// BodyId` in slabs.ts) — this suite only cares that distinct ids get distinct
// buffers, not that these particular names are registered ones.
const id = (name: string): BodyId => name as BodyId;

function mockDevice(opts?: {
  renderPipelines?: GPURenderPipelineDescriptor[];
  buffers?: BufferDesc[];
  shaderCode?: string[];
}): GPUDevice {
  return {
    createShaderModule: vi.fn((desc: GPUShaderModuleDescriptor) => {
      opts?.shaderCode?.push(desc.code);
      return { getCompilationInfo: () => Promise.resolve({ messages: [] }) };
    }),
    createBuffer: vi.fn((desc: BufferDesc) => {
      opts?.buffers?.push(desc);
      // Carries the label onto the returned stand-in (mirrors
      // bodyPickRenderer.test.ts's mock) so a test can trace a writeBuffer
      // target or a bound vertex buffer back to the body it belongs to.
      return { label: desc.label, destroy: vi.fn() };
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
    expect(buffers.find((b) => b.label?.startsWith('planet-instance-vbo'))).toBeUndefined();
  });

  it('draw is callable with (pass, bodyId, instances, count) and records ONE indexed draw', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float', false);

    const pass = mockPass();
    const instances = new Float32Array(2 * INSTANCE_FLOATS);
    expect(() => renderer.draw(pass, id('jupiter'), instances, 2)).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
    // drawIndexed(indexCount, instanceCount): second arg is the planet count.
    expect((pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toBe(2);
  });

  it('draw does exactly one writeBuffer of the caller`s array with count × 28 float elements', () => {
    const device = mockDevice();
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();
    const instances = new Float32Array(5 * INSTANCE_FLOATS);

    const writeMock = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    writeMock.mockClear(); // drop the construction-time geometry uploads
    renderer.draw(pass, id('mars'), instances, 3);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [, byteOffset, data, dataOffset, size] = writeMock.mock.calls[0]!;
    expect(byteOffset).toBe(0);
    expect(data).toBe(instances); // the caller's array, uploaded directly
    expect(dataOffset).toBe(0);
    // Element counts (not bytes): 3 records × 28 floats.
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
    renderer.draw(pass, id('mars'), instances, 0);
    expect(writeMock).not.toHaveBeenCalled();
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('a body`s buffer grows past its initial capacity', () => {
    // Regression coverage for the MAX_PLANETS = 24 defect: the planet table
    // used to outgrow the buffer silently (Math.min clamp). Now a body's
    // buffer has no cap — it grows to whatever that body's count demands,
    // the same grow-only-reuse pattern starPointRenderer.setStars uses for
    // its instance buffer.
    const buffers: BufferDesc[] = [];
    const device = mockDevice({ buffers });
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();

    // First draw establishes mars' initial capacity of 3.
    renderer.draw(pass, id('mars'), new Float32Array(3 * INSTANCE_FLOATS), 3);
    const afterFirst = buffers.filter((b) => b.label?.startsWith('planet-instance-vbo'));
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.size).toBe(3 * INSTANCE_STRIDE);

    // A later draw asking for more instances than that capacity must grow the
    // SAME body's buffer (a second allocation), not truncate to the first size.
    renderer.draw(pass, id('mars'), new Float32Array(7 * INSTANCE_FLOATS), 7);
    const afterSecond = buffers.filter((b) => b.label?.startsWith('planet-instance-vbo'));
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[1]!.size).toBe(7 * INSTANCE_STRIDE);
    // The grown draw actually issues all 7 instances — nothing dropped.
    const lastCall = (pass.drawIndexed as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(lastCall[1]).toBe(7);
  });

  it('two different bodies drawn in one submit get DISTINCT instance buffers (no clobber)', () => {
    // The writeBuffer-vs-submit regression: `planetsLayer` calls `draw` once
    // PER BODY-M SLAB ROW, all inside one encoder + submit. A single shared
    // instance buffer would let mars' writeBuffer clobber mercury's bytes
    // before the GPU ran either draw, so both rows must land in DIFFERENT
    // buffers at DIFFERENT vertex-buffer bindings.
    const device = mockDevice();
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();

    renderer.draw(pass, id('mercury'), new Float32Array(INSTANCE_FLOATS), 1);
    renderer.draw(pass, id('mars'), new Float32Array(INSTANCE_FLOATS), 1);

    const setVbo = pass.setVertexBuffer as unknown as ReturnType<typeof vi.fn>;
    const instanceVbos = setVbo.mock.calls.filter((c) => c[0] === 1).map((c) => c[1]);
    expect(instanceVbos).toHaveLength(2);
    expect(instanceVbos[0]).not.toBe(instanceVbos[1]);

    const writeMock = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const targets = writeMock.mock.calls
      .map((c) => c[0] as { label?: string })
      .filter((buf) => buf.label?.startsWith('planet-instance-vbo'));
    expect(targets).toHaveLength(2);
    expect(targets[0]!.label).not.toBe(targets[1]!.label);
  });

  it('re-drawing the SAME body reuses its buffer, not a fresh allocation', () => {
    const buffers: BufferDesc[] = [];
    const device = mockDevice({ buffers });
    const renderer = createPlanetRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = mockPass();

    renderer.draw(pass, id('mars'), new Float32Array(INSTANCE_FLOATS), 1);
    renderer.draw(pass, id('mars'), new Float32Array(INSTANCE_FLOATS), 1);
    expect(buffers.filter((b) => b.label?.startsWith('planet-instance-vbo'))).toHaveLength(1);
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
    expect(() => renderer.draw(pass, id('mars'), instances, 5)).toThrow();
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
    // Two vertex buffers: per-vertex position + per-instance records.
    const vbs = Array.from(desc.vertex.buffers!);
    expect(vbs).toHaveLength(2);
    expect(vbs[1]!.stepMode).toBe('instance');
    expect(vbs[1]!.arrayStride).toBe(INSTANCE_STRIDE);
  });

  it('draws the proxy shell`s FAR hemisphere — cullMode front, not back', () => {
    // The mesh is a circumscribing proxy, not the surface. Culling the FRONT
    // faces is what keeps the body on screen once the camera crosses inside the
    // 5% shell (a legal close approach); culling back faces instead makes the
    // whole body vanish at the moment of closest approach and at no other time,
    // which no other assertion here would catch.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createPlanetRenderer(mockDevice({ renderPipelines }), 'rgba16float', 'depth32float', false);
    expect(renderPipelines[0]!.primitive).toMatchObject({ frontFace: 'ccw', cullMode: 'front' });
  });

  it('names entry points the linked WESL modules actually declare', () => {
    // The TS `entryPoint` string and the `fn` name in the .wesl are a cross-file
    // contract with no compiler check; a rename on one side fails only when the
    // browser builds the pipeline.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    const shaderCode: string[] = [];
    createPlanetRenderer(
      mockDevice({ renderPipelines, shaderCode }),
      'rgba16float',
      'depth32float',
      false,
    );
    const linked = shaderCode.join('\n');
    const desc = renderPipelines[0]!;
    for (const entryPoint of [desc.vertex.entryPoint, desc.fragment!.entryPoint]) {
      expect(linked).toMatch(new RegExp(`fn\\s+${entryPoint!}\\s*\\(`));
    }
  });

  it('every vertex attribute is declared by the linked WESL, and the records tile the stride', () => {
    // The layout is a byte-for-byte contract between the pipeline descriptor
    // here and the `@location` list in planet/vertex.wesl, and nothing checks
    // it: a slot added on one side alone reads garbage (or silently shifts the
    // fields after it), which shows up as a mis-lit or mis-placed planet, not an
    // error. So: the shader must declare exactly the locations the descriptor
    // binds, at matching widths, and the instance record must tile its stride
    // with no gap and no overlap.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    const shaderCode: string[] = [];
    createPlanetRenderer(
      mockDevice({ renderPipelines, shaderCode }),
      'rgba16float',
      'depth32float',
      false,
    );
    const linked = shaderCode.join('\n');

    // Only the `fn vs(...)` parameter list — the inter-stage struct carries its
    // own unrelated `@location`s.
    const params = /fn\s+vs\s*\(([\s\S]*?)\)\s*->/.exec(linked)![1]!;
    const declared = new Map<number, string>();
    for (const m of params.matchAll(/@location\((\d+)\)\s*\w+\s*:\s*(vec\d<f32>)/g)) {
      declared.set(Number(m[1]!), m[2]!);
    }

    const WGSL_TYPE: Record<string, string> = { float32x3: 'vec3<f32>', float32x4: 'vec4<f32>' };
    const BYTES: Record<string, number> = { float32x3: 12, float32x4: 16 };

    const vbs = Array.from(renderPipelines[0]!.vertex.buffers!);
    const bound = vbs.flatMap((vb) => Array.from(vb!.attributes));
    for (const attr of bound) {
      expect(declared.get(attr.shaderLocation)).toBe(WGSL_TYPE[attr.format]);
    }
    // …and nothing the shader declares goes unbound: an @location added to the
    // shader alone is the same defect from the other side.
    expect([...declared.keys()].sort((a, b) => a - b)).toEqual(
      bound.map((a) => a.shaderLocation).sort((a, b) => a - b),
    );

    // The instance record tiles its stride exactly — no hole a forgotten field
    // could hide in, and no overlap.
    const instance = Array.from(vbs[1]!.attributes).sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    for (const attr of instance) {
      expect(attr.offset).toBe(cursor);
      cursor += BYTES[attr.format]!;
    }
    expect(cursor).toBe(vbs[1]!.arrayStride);
    expect(instance.length * 4).toBe(INSTANCE_FLOATS); // every slot is a vec4
  });
});
