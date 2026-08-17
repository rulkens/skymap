/**
 * GalaxyPointRenderer — unit tests for the pipeline half of the point program.
 *
 * The renderer owns what exists once per pipeline: the shader modules, the
 * render pipeline (and its colour target), the per-frame `@group(0)` uniform
 * buffer, and the draw call. The per-catalog GPU resources it delegates to
 * `catalogStore` — their upload / unload / splice / count contracts are
 * pinned in `catalogStore.test.ts`, not here. What remains here is the
 * pipeline descriptor, the composed `draw()`, and the composed teardown
 * (which must reach through the store as well as its own uniform buffer).
 *
 * ### Why a stub `GPUDevice`
 *
 * `createGalaxyPointRenderer`'s constructor calls real WebGPU APIs
 * (`createShaderModule`, `createRenderPipeline`, `createBuffer`, …) that
 * only exist on a live device. The stub's `createBuffer` returns a sentinel
 * (no VRAM) and the pipeline factories return just enough shape for
 * construction. Pixel-level assertions need a real browser harness.
 */

import { describe, it, expect } from 'vitest';
import { createGalaxyPointRenderer } from '../../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPointRenderer';
// `BuildRunner` belongs to the store; the renderer only forwards it.
import type { BuildRunner } from '../../../../../src/services/gpu/renderers/galaxyCatalog/catalogStore';
import { buildPointInterleavedBuffer } from '../../../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { Source, SOURCE_REGISTRY } from '../../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { Mat4 } from 'wgpu-matrix';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';

// GalaxyPointRenderer keys its catalogs by the string `GalaxyCatalogId`; these
// tests still reason in terms of the numeric `Source` codes, so resolve the
// id at each upload call site through the registry.
function idOf(source: (typeof Source)[keyof typeof Source]): GalaxyCatalogId {
  return SOURCE_REGISTRY[source].id as GalaxyCatalogId;
}

// `GPUBufferUsage` and friends come from the shared
// `tests/setup/webgpuGlobals.ts` setupFile.
//
// Production `upload()` spawns a Vite `?worker` chunk to bake off-thread, but
// `Worker` doesn't exist in Vitest's Node environment.  Every renderer below is
// therefore constructed with this runner, which routes the bake through the
// same pure function the worker would call — bit-identical behaviour without a
// structured-clone round-trip.
const testRunner: BuildRunner = async (input) => buildPointInterleavedBuffer(input);

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal `GalaxyCatalog` with `count` points. All photometry arrays are
 * filled with safe defaults (zeros) — neither the upload path nor the draw
 * path inspects their values here, only their lengths.
 */
function makeCloud(count: number): GalaxyCatalog {
  return makeGalaxyCatalog(count, {
    objIDs: new BigUint64Array(count),
    // Fill with the 30 kpc project default so apparent-size logic never
    // divides by zero.
    diameterKpc: new Float32Array(count).fill(30),
  });
}

/**
 * A skeletal stand-in for `GPUDevice` — just enough surface area for the
 * `GalaxyPointRenderer` constructor (and the store it composes) to run without
 * throwing. Returned `GPUBuffer`s carry a `destroy` method and a `size`
 * field, but no real GPU memory backs them.
 */
function makeStubDevice(): GPUDevice {
  // Each helper mints a sentinel object that satisfies the structural type
  // expected by `GalaxyPointRenderer`. `as unknown as T` is the standard way to
  // squeeze a stub through TypeScript's strict structural checks.
  const stubBuffer = (): GPUBuffer =>
    ({
      destroy: () => {},
      size: 0,
    }) as unknown as GPUBuffer;

  return {
    // GalaxyPointRenderer routes shader-module creation through
    // `createShaderModuleWithDevLog`, which calls `getCompilationInfo()`
    // when `import.meta.env.DEV` is true (Vitest's default).  The stub
    // therefore must expose a Promise-returning `getCompilationInfo` —
    // otherwise the helper throws on `module.getCompilationInfo is not
    // a function`.
    createShaderModule: () =>
      ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      }) as unknown as GPUShaderModule,
    createPipelineLayout: () => ({}) as unknown as GPUPipelineLayout,
    createBindGroupLayout: () => ({}) as unknown as GPUBindGroupLayout,
    createRenderPipeline: () =>
      ({
        // `getBindGroupLayout` is invoked by the constructor when wiring the
        // uniform buffer into the bind group; return a sentinel.
        getBindGroupLayout: () => ({}) as unknown as GPUBindGroupLayout,
      }) as unknown as GPURenderPipeline,
    createBuffer: () => stubBuffer(),
    createBindGroup: () => ({}) as unknown as GPUBindGroup,
    queue: {
      // `writeBuffer` is invoked from `upload()` and per-frame from `draw()`.
      writeBuffer: () => {},
    },
  } as unknown as GPUDevice;
}

// Stub BGLs — createGalaxyPointRenderer requires fadeBgl + sourceBgl +
// focusBgl as canonical shared layouts. These stubs satisfy the branded
// opaque-newtype shape structurally.
function makeStubFadeBgl() {
  return {} as import('../../../../../src/@types/rendering/FadeUniformsBgl').FadeUniformsBgl;
}
function makeStubSourceBgl() {
  return {} as import('../../../../../src/@types/rendering/SourceUniformsBgl').SourceUniformsBgl;
}
function makeStubFocusBgl() {
  return {} as import('../../../../../src/@types/rendering/FocusUniformsBgl').FocusUniformsBgl;
}

// Stub shared focus bind group passed into draw() — the renderer only
// binds it (setBindGroup(3, …)), never introspects it.
const FOCUS_BIND_GROUP = {} as unknown as GPUBindGroup;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GalaxyPointRenderer colour target', () => {
  it('bakes the given targetFormat into the pipeline colour target', () => {
    const captured: GPURenderPipelineDescriptor[] = [];
    const device = {
      ...makeStubDevice(),
      createRenderPipeline: (desc: GPURenderPipelineDescriptor) => {
        captured.push(desc);
        return { getBindGroupLayout: () => ({}) } as unknown as GPURenderPipeline;
      },
    } as unknown as GPUDevice;
    createGalaxyPointRenderer({
      device,
      targetFormat: 'rgba16float',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    expect(captured).toHaveLength(1);
    const target = Array.from(captured[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

// ─── GalaxyPointRenderer.destroy() ─────────────────────────────────────────────────
//
// GalaxyPointRenderer owns the app's largest GPU allocations (via the store: the
// per-source vertex buffers ~14 MB each plus per-source fade + source uniform
// buffers; and directly: its own per-frame uniform buffer).  WebGPU buffers
// don't release via JS GC alone — `GPUBuffer.destroy()` is mandatory.  These
// tests assert that `GalaxyPointRenderer.destroy()` fires destroy on every owned
// buffer across BOTH halves of the composition and clears the store's map, so
// the engine.ts teardown chain plateaus browser GPU memory across HMR /
// StrictMode remount cycles instead of climbing.
//
// We extend the stub device with a *tracking* buffer factory: every
// `createBuffer` call returns a fresh stub whose `destroy()` increments a
// counter we can assert against.  Because the renderer hands its own device to
// the store, the tracking factory observes the store's allocations too — three
// buffers per upload (vertex buffer, FadeUniforms 16-byte uniform,
// SourceUniforms 16-byte uniform) plus the renderer's own uniform buffer
// up-front.  We can therefore predict the exact destroy fan-out for any given
// upload sequence.

/**
 * Build a stub device whose `createBuffer` returns *trackable* stub
 * buffers.  Each returned buffer carries a `destroyCount` we can read
 * post-`renderer.destroy()` to assert it was released.  The device also
 * appends every created buffer to the supplied array so tests can iterate
 * the fan-out.
 *
 * Why not `vi.spyOn` the existing `makeStubDevice` factory?  The
 * `destroy()` method lives on each *individual* buffer, not on the
 * factory, and `makeStubDevice`'s `stubBuffer()` closure mints fresh
 * objects that aren't reachable from outside.  A tracking factory is the
 * cleanest extension that doesn't refactor the original helper.
 */
type TrackedBuffer = GPUBuffer & { destroyCount: number };
function makeDestroyTrackingDevice(createdBuffers: TrackedBuffer[]): GPUDevice {
  const device = makeStubDevice();
  (device as unknown as { createBuffer: () => GPUBuffer }).createBuffer = (): GPUBuffer => {
    const buf: TrackedBuffer = {
      destroy() {
        buf.destroyCount += 1;
      },
      size: 0,
      destroyCount: 0,
    } as unknown as TrackedBuffer;
    createdBuffers.push(buf);
    return buf;
  };
  return device;
}

describe('GalaxyPointRenderer.destroy', () => {
  it("releases the renderer's uniform buffer", () => {
    const buffers: TrackedBuffer[] = [];
    const device = makeDestroyTrackingDevice(buffers);
    const renderer = createGalaxyPointRenderer({
      device,
      targetFormat: 'rgba16float',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    // The constructor allocates one buffer: the renderer's own uniform.
    // The cluster-focus uniform is shared and owned by the engine
    // (state.gpu.focusUniform), not the renderer.
    expect(buffers).toHaveLength(1);
    for (const b of buffers) expect(b.destroyCount).toBe(0);

    renderer.destroy();

    for (const b of buffers) expect(b.destroyCount).toBe(1);
  });

  it('releases each per-source buffer + fade uniform', async () => {
    const buffers: TrackedBuffer[] = [];
    const device = makeDestroyTrackingDevice(buffers);
    const renderer = createGalaxyPointRenderer({
      device,
      targetFormat: 'rgba16float',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    // Constructor allocates 1 buffer: the renderer's own uniform (the
    // cluster-focus uniform is shared/engine-owned, not per renderer).
    expect(buffers).toHaveLength(1);

    await renderer.upload(idOf(Source.SDSS), makeCloud(2));
    // upload() allocates 3 more buffers per source: the vertex buffer,
    // the FadeUniforms 16-byte uniform, and the SourceUniforms 16-byte
    // uniform (unified-fade architecture).
    expect(buffers).toHaveLength(4);

    await renderer.upload(idOf(Source.TwoMRS), makeCloud(3));
    // Second source: another vertex + fade + source triple.
    expect(buffers).toHaveLength(7);

    // Sanity: every tracked buffer starts at 0 destroys.
    for (const b of buffers) expect(b.destroyCount).toBe(0);

    renderer.destroy();

    // All seven buffers (renderer uniform + 2 sources × {vertex, fade,
    // source}) should be destroyed exactly once.
    for (const b of buffers) expect(b.destroyCount).toBe(1);
  });

  it('clears the galaxyCatalogs map', async () => {
    const renderer = createGalaxyPointRenderer({
      device: makeStubDevice(),
      targetFormat: 'rgba16float',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    await renderer.upload(idOf(Source.SDSS), makeCloud(2));
    await renderer.upload(idOf(Source.TwoMRS), makeCloud(3));
    expect(Array.from(renderer.loadedSources())).toHaveLength(2);

    renderer.destroy();

    expect(Array.from(renderer.loadedSources())).toHaveLength(0);
  });

  it('is idempotent — safe to call twice without throwing', async () => {
    const buffers: TrackedBuffer[] = [];
    const device = makeDestroyTrackingDevice(buffers);
    const renderer = createGalaxyPointRenderer({
      device,
      targetFormat: 'rgba16float',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    await renderer.upload(idOf(Source.SDSS), makeCloud(1));

    expect(() => renderer.destroy()).not.toThrow();
    // Second call iterates an empty galaxyCatalogs map and re-destroys the
    // already-destroyed uniform buffer.  WebGPU's spec defines
    // `GPUBuffer.destroy()` as idempotent; our stub mirrors that by
    // simply incrementing the counter — the test's contract is "no
    // throw", not "destroyCount stays at 1".
    expect(() => renderer.destroy()).not.toThrow();
  });
});

describe('GalaxyPointRenderer.draw — GalaxyPointDrawSettings shape', () => {
  it('accepts a single GalaxyPointDrawSettings record', async () => {
    const renderer = createGalaxyPointRenderer({
      device: makeStubDevice(),
      targetFormat: 'bgra8unorm',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    await renderer.upload(idOf(Source.SDSS), makeCloud(10));

    // Stub the encoder.  draw() must call setPipeline + setBindGroup + draw
    // once (one source loaded, one passing visibility bit).
    const calls: string[] = [];
    const pass = {
      setPipeline: () => calls.push('setPipeline'),
      setBindGroup: () => calls.push('setBindGroup'),
      setVertexBuffer: () => calls.push('setVertexBuffer'),
      draw: () => calls.push('draw'),
    } as unknown as GPURenderPassEncoder;

    const viewProj = new Float32Array(16) as unknown as Mat4;

    renderer.draw(pass, viewProj, [800, 600], {
      pointSizePx: 1,
      brightness: 1,
      selectedPacked: 0xffffffff >>> 0,
      visibleSourceMask: 0xffffffff,
      camPosWorld: [0, 0, 0],
      pxPerRad: 1,
      provenance: {
        orientation: { highlight: false, filter: 'all' },
        size: { highlight: false, filter: 'all' },
      },
      biasMode: 0,
      absMagLimit: 0,
      depthFadeEnabled: false,
      sbScale: 8,
      sbMax: 30,
      falloffStrength: 0.8,
      pxFadeStart: 0,
      pxFadeEnd: 0,
      focusBindGroup: FOCUS_BIND_GROUP,
      fadeOpacityOf: () => 1,
    });

    expect(calls).toContain('setPipeline');
    expect(calls).toContain('draw');
  });

  it('skips a source whose resolved fade opacity is exactly 0', async () => {
    // Alpha-0 instances into the additive target are pure GPU cost for zero
    // contribution, so the per-source loop drops the draw call entirely when
    // the fadeOpacityOf callback resolves to exactly 0 (a fade reaches 0
    // continuously before the skip engages, so no pop is possible).
    const renderer = createGalaxyPointRenderer({
      device: makeStubDevice(),
      targetFormat: 'bgra8unorm',
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      focusBgl: makeStubFocusBgl(),
      buildRunner: testRunner,
    });
    await renderer.upload(idOf(Source.SDSS), makeCloud(10));
    await renderer.upload(idOf(Source.Glade), makeCloud(10));

    const drawnCounts: number[] = [];
    const pass = {
      setPipeline: () => {},
      setBindGroup: () => {},
      setVertexBuffer: () => {},
      draw: (_verts: number, instances: number) => drawnCounts.push(instances),
    } as unknown as GPURenderPassEncoder;

    renderer.draw(pass, new Float32Array(16) as unknown as Mat4, [800, 600], {
      pointSizePx: 1,
      brightness: 1,
      selectedPacked: 0xffffffff >>> 0,
      visibleSourceMask: 0xffffffff,
      camPosWorld: [0, 0, 0],
      pxPerRad: 1,
      provenance: {
        orientation: { highlight: false, filter: 'all' },
        size: { highlight: false, filter: 'all' },
      },
      biasMode: 0,
      absMagLimit: 0,
      depthFadeEnabled: false,
      sbScale: 8,
      sbMax: 30,
      falloffStrength: 0.8,
      pxFadeStart: 0,
      pxFadeEnd: 0,
      focusBindGroup: FOCUS_BIND_GROUP,
      // SDSS fully faded → skipped; GLADE at partial opacity → drawn.
      fadeOpacityOf: (source) => (source === Source.SDSS ? 0 : 0.5),
    });

    // Exactly one instanced draw fired (GLADE's 10 instances); SDSS's was
    // dropped by the skip, not merely drawn at alpha 0.
    expect(drawnCounts).toEqual([10]);
  });
});
