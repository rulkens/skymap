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
  it('iterates clouds in `ALL_SOURCES` order with correct instanceIdOffsets', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    // Upload in non-iteration order on purpose — the renderer must re-sort.
    // ALL_SOURCES is ordered smallest-catalogue → largest:
    //   [Synthetic, Famous, TwoMRS, SDSS, Glade]
    // so TwoMRS comes before SDSS.
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));

    const entries = Array.from(renderer.loadedSources());

    // TwoMRS comes before SDSS regardless of upload order, because the
    // renderer recomputes offsets via `ALL_SOURCES` iteration.
    expect(entries.map((e) => e.source)).toEqual([Source.TwoMRS, Source.SDSS]);

    // Offsets are running sums in ALL_SOURCES order: TwoMRS at 0, SDSS
    // after TwoMRS's 50.
    expect(entries[0]!.instanceIdOffset).toBe(0);
    expect(entries[0]!.count).toBe(50);
    expect(entries[1]!.instanceIdOffset).toBe(50);
    expect(entries[1]!.count).toBe(100);
  });

  it('recomputes instanceIdOffset after unload', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    // ALL_SOURCES order is [Synthetic, Famous, TwoMRS, SDSS, Glade]
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.Glade, makeCloud(25));

    renderer.unload(Source.TwoMRS);

    const entries = Array.from(renderer.loadedSources());
    expect(entries.map((e) => e.source)).toEqual([Source.SDSS, Source.Glade]);
    // With TwoMRS gone, SDSS is now first (offset 0) and Glade follows at 100.
    expect(entries[0]!.instanceIdOffset).toBe(0);
    expect(entries[1]!.instanceIdOffset).toBe(100);
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

// ─── Regression: empty-cloud upload (small-tier exclusion path) ──────────────
//
// `engine.setTier('small')` excludes SDSS (TIER_TARGETS.small[SDSS] === 0)
// and `cloudLoader.reloadSource` fires an empty-cloud (count: 0) callback so
// the renderer can clear the source's GPU buffer.  The naive path would call
// `device.createBuffer({ size: 0, ... })` which the WebGPU spec forbids
// (OperationError on `size === 0`); the prior buffer would already be
// destroyed by then, leaving the entry in the clouds Map with a destroyed
// buffer reference and the next frame's draw call would fault.
//
// Contract: a count=0 upload destroys the prior buffer, REMOVES the entry
// from `loadedSources()` entirely, and never calls `createBuffer`.  The
// draw loop's existing `if (!entry) continue;` then naturally skips the
// excluded source.
describe('PointRenderer.upload — regression: empty-cloud unload', () => {
  it('destroys the prior buffer and removes the entry on a count=0 upload', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(1000));

    const firstEntry = Array.from(renderer.loadedSources()).find(
      (e) => e.source === Source.SDSS,
    );
    expect(firstEntry).toBeDefined();
    const destroySpy = vi.spyOn(firstEntry!.vertexBuffer, 'destroy');

    // Empty cloud — same shape `cloudLoader.reloadSource` builds when
    // `TIER_TARGETS[tier][source] === 0`.
    await renderer.upload(Source.SDSS, makeCloud(0));

    // Prior buffer destroyed (VRAM freed).
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Entry is GONE from the bookkeeping — not lingering with a broken
    // buffer reference, not lingering with count=0.  Either of those would
    // produce a different failure mode on the next frame.
    const lookup = Array.from(renderer.loadedSources()).find((e) => e.source === Source.SDSS);
    expect(lookup).toBeUndefined();
    expect(renderer.totalCount()).toBe(0);
  });

  it('survives upload(0) when no prior cloud exists', async () => {
    // Pathological-but-legal: the engine could in principle call setTier
    // before any cloud has loaded.  Should be a no-op, not a crash.
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await expect(renderer.upload(Source.SDSS, makeCloud(0))).resolves.toBeUndefined();
    expect(renderer.totalCount()).toBe(0);
  });

  it('allows re-uploading a real cloud after an empty-cloud unload', async () => {
    // small → medium swap: SDSS goes from count=0 (excluded) back to count>0
    // (the medium tier file).  The empty-cloud path must leave the renderer
    // in a state where a subsequent real upload works normally.
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(1000));
    await renderer.upload(Source.SDSS, makeCloud(0));
    await renderer.upload(Source.SDSS, makeCloud(750));

    const entries = Array.from(renderer.loadedSources());
    expect(entries.length).toBe(1);
    expect(entries[0]!.source).toBe(Source.SDSS);
    expect(entries[0]!.count).toBe(750);
  });
});

// ─── Regression: parallel-upload rebake race ─────────────────────────────────
//
// Tier swap fires two `upload()` calls in parallel — typically SDSS and GLADE
// reloading their new-tier `.bin`s simultaneously.  Whichever finishes its
// worker bake first runs `recomputeInstanceIdOffsets()` and then calls
// `rebakeStaleSources()`, which re-bakes the OTHER source via
// `await this.upload(other, entry.cloud)`.  The bug: `entry.cloud` is the
// *prior* tier's cloud (the in-flight new upload hasn't replaced it yet).
// The slow rebake of the prior cloud finishes after the fresh in-flight
// upload, overwriting the new buffer with old data.
//
// Manifested as: medium → large → medium leaves GLADE drawing the LARGE
// cloud because SDSS's medium-upload's rebake stomped the GLADE-medium
// buffer that had just landed.
//
// Fix: track in-flight uploads per source and skip them in
// `rebakeStaleSources` — the in-flight upload's own post-bake rebake will
// catch any residual staleness with the correct (current) cloud reference.
describe('PointRenderer.upload — regression: parallel-upload rebake race', () => {
  it('does not overwrite a concurrent upload during rebake', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');

    // Seed with the "prior tier" layout so the rebake has stale offsets to act on.
    await renderer.upload(Source.SDSS, makeCloud(498_227));
    await renderer.upload(Source.Glade, makeCloud(1_995_421));

    // Build per-source delays: SDSS bakes fast (50 ms), GLADE bakes slow
    // (200 ms).  SDSS's post-bake rebake fires while GLADE's worker is still
    // running.  Without the fix, SDSS's rebake re-bakes GLADE using the OLD
    // (1.9M) cloud reference and stomps the in-flight GLADE-medium upload.
    const delaysMs = new Map<Source, number>([
      [Source.SDSS, 50],
      [Source.Glade, 200],
    ]);
    PointRenderer.setBuildBufferRunner(async (input) => {
      const ms = delaysMs.get(input.source) ?? 0;
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return buildPointInterleavedBuffer(input);
    });

    try {
      // Tier swap: kick off both in parallel, the way `engine.setTier` does.
      const sdssPromise = renderer.upload(Source.SDSS, makeCloud(156_000));
      const gladePromise = renderer.upload(Source.Glade, makeCloud(400_000));

      await Promise.all([sdssPromise, gladePromise]);

      const entries = Array.from(renderer.loadedSources());
      const sdss = entries.find((e) => e.source === Source.SDSS);
      const glade = entries.find((e) => e.source === Source.Glade);

      expect(sdss?.count).toBe(156_000);
      // The bug surfaced as `glade.count === 1_995_421` here — the rebake
      // resurrected the old large cloud.  The fix keeps GLADE on the new
      // medium cloud the user actually requested.
      expect(glade?.count).toBe(400_000);
    } finally {
      // Restore the no-delay default for sibling tests.
      PointRenderer.setBuildBufferRunner(async (input) => buildPointInterleavedBuffer(input));
    }
  });
});

// ─── Global-idx encoding / decoding ───────────────────────────────────────────
//
// `toGlobalIdx` and `fromGlobalIdx` are the boundary the engine uses to
// encode (or decode) the cross-survey global instance ID space.  The
// encoding rule — running sum of prior-source counts in `ALL_SOURCES`
// enum order — is the renderer's, baked into every per-instance
// vertex buffer's `globalInstanceIdx` slot.  Engine consumers used to
// duplicate the rule in three places (`resolveGlobalIdx`,
// `selectFamous`, `selectByAlias`); now they ask the renderer through
// these methods, keeping the rule to a single source of truth.
describe('PointRenderer global-idx encoding', () => {
  it('toGlobalIdx + fromGlobalIdx round-trip across multiple sources', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    // ALL_SOURCES order is [Synthetic, Famous, TwoMRS, SDSS, Glade], so
    // TwoMRS comes before SDSS and Glade comes last.
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    await renderer.upload(Source.Glade, makeCloud(200));

    // TwoMRS: localIdx 0 → globalIdx 0; SDSS: localIdx 0 → globalIdx 50;
    // Glade: localIdx 0 → globalIdx 150.
    expect(renderer.toGlobalIdx(Source.TwoMRS, 0)).toBe(0);
    expect(renderer.toGlobalIdx(Source.SDSS, 0)).toBe(50);
    expect(renderer.toGlobalIdx(Source.Glade, 0)).toBe(150);
    expect(renderer.toGlobalIdx(Source.Glade, 199)).toBe(349);

    // fromGlobalIdx is the inverse.
    expect(renderer.fromGlobalIdx(0)).toEqual({ source: Source.TwoMRS, localIdx: 0 });
    expect(renderer.fromGlobalIdx(49)).toEqual({ source: Source.TwoMRS, localIdx: 49 });
    expect(renderer.fromGlobalIdx(50)).toEqual({ source: Source.SDSS, localIdx: 0 });
    expect(renderer.fromGlobalIdx(149)).toEqual({ source: Source.SDSS, localIdx: 99 });
    expect(renderer.fromGlobalIdx(150)).toEqual({ source: Source.Glade, localIdx: 0 });
    expect(renderer.fromGlobalIdx(349)).toEqual({ source: Source.Glade, localIdx: 199 });
  });

  it('fromGlobalIdx returns null for out-of-range indices', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.SDSS, makeCloud(100));

    // Past the end of every loaded source.
    expect(renderer.fromGlobalIdx(100)).toBeNull();
    expect(renderer.fromGlobalIdx(1_000_000)).toBeNull();
  });

  it('toGlobalIdx returns localIdx for unloaded sources (matches instanceIdOffset === 0)', () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    // Nothing uploaded — every source's offset is 0, so toGlobalIdx is
    // identity on localIdx.
    expect(renderer.toGlobalIdx(Source.SDSS, 5)).toBe(5);
    expect(renderer.toGlobalIdx(Source.Glade, 5)).toBe(5);
  });
});
