/**
 * PointRenderer — unit tests for the multi-source bookkeeping API.
 *
 * Task 4 of the multi-survey integration: the renderer now owns one
 * `GPUBuffer` per `Source`, with per-source draw calls toggled by a bitmask.
 * These tests focus on the *bookkeeping* side of that change (count tracking,
 * unload, recompute of `instanceIdOffset`) — not on the actual GPU draw.
 *
 * ### Why we cast `device` to `any`
 *
 * `PointRenderer`'s constructor calls real WebGPU APIs (`createShaderModule`,
 * `createRenderPipeline`, `createBuffer`, …) which only exist on a live
 * `GPUDevice` and cannot be exercised inside Vitest's Node environment. We
 * use a minimal stub `GPUDevice` whose `createBuffer` returns a sentinel
 * object (no real VRAM) and whose `createShaderModule`/`createRenderPipeline`
 * return enough shape for construction to succeed. The tests below only call
 * methods that don't actually touch the GPU pipeline state — `upload()`,
 * `unload()`, `totalCount()` — so this stub is sufficient.
 *
 * If a future test needs to assert anything about the rendered pixels it
 * should run under @webgpu/types in a real browser harness; vitest is the
 * wrong tool for that.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PointRenderer } from '../../../src/services/gpu/pointRenderer';
import { buildPointInterleavedBuffer } from '../../../src/services/engine/buildPointInterleavedBuffer';
import { Source } from '../../../src/data/sources';
import type { PointCloud } from '../../../src/@types';

// `GPUBufferUsage` is a browser-global enum exposed by the WebGPU runtime;
// Node has no idea what it is. Vitest runs in Node, so referencing
// `GPUBufferUsage.VERTEX | …` inside `PointRenderer` would throw a
// ReferenceError before any of our stubs get a chance to run. We populate
// the globals with the integer values from the WebGPU spec so the bitwise
// ORs evaluate to a plain number — the stub buffers don't care.
beforeAll(() => {
  (globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };

  // The production `upload()` spawns a Vite `?worker` chunk to run the bake
  // off-thread.  Vitest loads modules in Node, where `Worker` doesn't exist
  // — instead of trying to polyfill the whole worker harness we just route
  // the bake through the same pure function the worker would call.  Tests
  // get bit-identical behaviour without any structured-clone round-trip.
  PointRenderer.setBuildBufferRunner(async (input) => buildPointInterleavedBuffer(input));
});

afterAll(() => {
  PointRenderer.setBuildBufferRunner(null);
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal `PointCloud` with `count` points. All photometry arrays are
 * filled with safe defaults (zeros) — the renderer's bookkeeping path never
 * inspects their values, only their lengths.
 */
function makeCloud(count: number): PointCloud {
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    // v3 orientation fields — the renderer's bookkeeping path doesn't inspect
    // their values yet (later tasks in galaxy-orientation-disks will), so
    // zero-filled arrays of the right length are sufficient.
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    // v4 diameter field — fill with 30 kpc (the project-wide default) so
    // any future test that reads apparent-size logic won't divide by zero.
    diameterKpc: new Float32Array(count).fill(30),
  };
}

/**
 * A skeletal stand-in for `GPUDevice` — just enough surface area for the
 * `PointRenderer` constructor and `upload()` / `unload()` to run without
 * throwing. Returned `GPUBuffer`s carry a `destroy` method (called during
 * unload) and a `size` field, but no real GPU memory backs them.
 */
function makeStubDevice(): GPUDevice {
  // Each helper mints a sentinel object that satisfies the structural type
  // expected by `PointRenderer`. `as unknown as T` is the standard way to
  // squeeze a stub through TypeScript's strict structural checks.
  const stubBuffer = (): GPUBuffer =>
    ({
      destroy: () => {},
      size: 0,
    }) as unknown as GPUBuffer;

  return {
    createShaderModule: () => ({}) as unknown as GPUShaderModule,
    createRenderPipeline: () =>
      ({
        // `getBindGroupLayout` is invoked by the constructor when wiring the
        // uniform buffer into the bind group; return a sentinel.
        getBindGroupLayout: () => ({}) as unknown as GPUBindGroupLayout,
      }) as unknown as GPURenderPipeline,
    createBuffer: () => stubBuffer(),
    createBindGroup: () => ({}) as unknown as GPUBindGroup,
    queue: {
      // `writeBuffer` is invoked from `upload()` (and per-frame from `draw()`).
      // The stub is a no-op — none of the tests below call `draw()`.
      writeBuffer: () => {},
    },
  } as unknown as GPUDevice;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PointRenderer.totalCount', () => {
  it('returns 0 before any upload', () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    expect(renderer.totalCount()).toBe(0);
  });

  it('sums counts across multiple sources', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    await renderer.upload(Source.Glade, makeCloud(25));
    expect(renderer.totalCount()).toBe(175);
  });

  it('updates after a source is unloaded', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    expect(renderer.totalCount()).toBe(150);

    renderer.unload(Source.SDSS);
    expect(renderer.totalCount()).toBe(50);
  });
});

describe('PointRenderer.loadedSources', () => {
  it('iterates clouds in `Source` enum order with correct instanceIdOffsets', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    // Upload in non-enum order on purpose — the renderer must re-sort.
    await renderer.upload(Source.TwoMRS, makeCloud(50)); // enum value 2
    await renderer.upload(Source.SDSS, makeCloud(100)); // enum value 1

    const entries = Array.from(renderer.loadedSources());

    // SDSS (enum=1) comes before TwoMRS (enum=2) regardless of upload order.
    expect(entries.map((e) => e.source)).toEqual([Source.SDSS, Source.TwoMRS]);

    // Offsets are running sums in enum order: SDSS at 0, TwoMRS after SDSS's 100.
    expect(entries[0]!.instanceIdOffset).toBe(0);
    expect(entries[0]!.count).toBe(100);
    expect(entries[1]!.instanceIdOffset).toBe(100);
    expect(entries[1]!.count).toBe(50);
  });

  it('recomputes instanceIdOffset after unload', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    await renderer.upload(Source.Glade, makeCloud(25));

    renderer.unload(Source.SDSS);

    const entries = Array.from(renderer.loadedSources());
    expect(entries.map((e) => e.source)).toEqual([Source.TwoMRS, Source.Glade]);
    // With SDSS gone, TwoMRS is now first (offset 0) and Glade follows at 50.
    expect(entries[0]!.instanceIdOffset).toBe(0);
    expect(entries[1]!.instanceIdOffset).toBe(50);
  });
});

// ─── Regression: replace, not append ──────────────────────────────────────────
//
// `engine.setTier` reuses the same `upload(source, cloud)` path that the
// initial load uses to swap a source's data when the user picks a different
// data tier.  The contract is that the *prior* GPU buffer for that source
// is destroyed before the new one is uploaded — anything else would either
// leak VRAM or, worse, leave the union of (oldCount + newCount) galaxies
// "live" on the GPU and visually doubled-up on screen.  This test pins
// that behaviour so a future refactor can't silently regress it.
describe('PointRenderer.upload — regression: replace, not append', () => {
  it('destroys the prior buffer for a source on second upload', async () => {
    // Two clouds with different counts: an "append" bug would leave the
    // sum (1500) in the bookkeeping; a correct "replace" leaves only 500.
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    const cloudA = makeCloud(1000);
    const cloudB = makeCloud(500);

    await renderer.upload(Source.SDSS, cloudA);
    const firstEntry = Array.from(renderer.loadedSources()).find(
      (e) => e.source === Source.SDSS,
    );
    expect(firstEntry).toBeDefined();
    const firstBuffer = firstEntry!.vertexBuffer;

    // Spy on the prior buffer's `destroy` so we observe the lifecycle event.
    // `makeStubDevice` mints a fresh GPUBuffer per `createBuffer` call, so
    // each upload's buffer has its own `destroy` we can spy on independently.
    const destroySpy = vi.spyOn(firstBuffer, 'destroy');

    await renderer.upload(Source.SDSS, cloudB);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Bookkeeping reflects the second upload's count, not the sum.
    const secondEntry = Array.from(renderer.loadedSources()).find(
      (e) => e.source === Source.SDSS,
    );
    expect(secondEntry?.count).toBe(500);

    // And the buffer reference itself has changed — replaced, not patched.
    expect(secondEntry?.vertexBuffer).not.toBe(firstBuffer);
  });
});
