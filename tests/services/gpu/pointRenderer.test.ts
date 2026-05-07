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
import { BiasMode } from '../../../src/data/biasMode';
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
    // PointRenderer routes shader-module creation through
    // `createShaderModuleWithDevLog`, which calls `getCompilationInfo()`
    // when `import.meta.env.DEV` is true (Vitest's default).  The stub
    // therefore must expose a Promise-returning `getCompilationInfo` —
    // otherwise the helper throws on `module.getCompilationInfo is not
    // a function`.
    createShaderModule: () =>
      ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      }) as unknown as GPUShaderModule,
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
  it('iterates clouds in `ALL_SOURCES` order regardless of upload order', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    // Upload in non-iteration order on purpose — the renderer must re-sort.
    // ALL_SOURCES is ordered smallest-catalogue → largest:
    //   [Synthetic, Famous, TwoMRS, SDSS, Glade]
    // so TwoMRS comes before SDSS.
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));

    const entries = Array.from(renderer.loadedSources());

    // TwoMRS comes before SDSS regardless of upload order.
    expect(entries.map((e) => e.source)).toEqual([Source.TwoMRS, Source.SDSS]);
    expect(entries[0]!.count).toBe(50);
    expect(entries[1]!.count).toBe(100);
  });

  it('drops an unloaded source from the iterator', async () => {
    const renderer = new PointRenderer(makeStubDevice(), 'bgra8unorm');
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.Glade, makeCloud(25));

    renderer.unload(Source.TwoMRS);

    const entries = Array.from(renderer.loadedSources());
    expect(entries.map((e) => e.source)).toEqual([Source.SDSS, Source.Glade]);
    expect(entries[0]!.count).toBe(100);
    expect(entries[1]!.count).toBe(25);
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

// ─── Regression: cross-source pick-identity disjointness ─────────────────────
//
// Before this refactor, the renderer baked a per-instance running-sum
// `globalInstanceIdx` into each vertex buffer.  Parallel uploads at boot
// could leave a source's `bakedPriorCount` permanently stale; after all
// surveys settled, two galaxies in different sources ended up with the
// same baked global ID and clicking either fired the halo on both —
// the picking-collision bug we're fixing.
//
// With the new (sourceCode << 27) | localIdx packing the collision is
// structurally impossible: each source's identity range is its top-5-bit
// slice of the u32, so cross-source overlap can't happen at any
// localIdx.  This test verifies the property by enumerating the packed
// values for two sources at every localIdx and asserting set
// disjointness.
describe('PointRenderer pick-identity packing — cross-source disjointness', () => {
  it('packed identities never collide across sources', () => {
    // The packing rule: top 5 bits = source code, bottom 27 = localIdx.
    // Any two distinct sources differ in the top 5 bits, so their
    // packed ranges can never overlap regardless of localIdx.  We assert
    // this by computing a pair of fixed-size identity sets for two
    // sources with different IDs and large counts, and checking the
    // intersection is empty.
    function packedIdentitiesFor(source: Source, count: number): Set<number> {
      const out = new Set<number>();
      for (let i = 0; i < count; i++) {
        out.add(((source << 27) | i) >>> 0);
      }
      return out;
    }

    // 100k galaxies in each source — well below the 2^27 = 134M localIdx
    // budget, but enough to stress the property.
    const sdss = packedIdentitiesFor(Source.SDSS, 100_000);
    const glade = packedIdentitiesFor(Source.Glade, 100_000);

    // No overlap.  Old encoding could hit this when SDSS's prior count
    // happened to overlap GLADE's localIdx range; new encoding can't.
    let collisions = 0;
    for (const v of sdss) {
      if (glade.has(v)) collisions++;
    }
    expect(collisions).toBe(0);
  });

  it('packed identity is decodable: pack then unpack round-trips', () => {
    // The picker subtracts 1 from the bottom 27 bits before exposing
    // localIdx, but its packing rule (with the +1 sentinel that keeps
    // 0 = "no hit") is what we're encoding here.  The renderer's
    // selection-halo path uses the same top-5-bit / bottom-27-bit
    // split sans the +1, so we test both.
    const cases: Array<{ source: Source; localIdx: number }> = [
      { source: Source.Synthetic, localIdx: 0 },
      { source: Source.Famous, localIdx: 17 },
      { source: Source.TwoMRS, localIdx: 38_000 },
      { source: Source.SDSS, localIdx: 500_000 },
      { source: Source.Glade, localIdx: 2_000_000 },
    ];
    for (const c of cases) {
      // Selection-halo packing (no +1).
      const packed = ((c.source << 27) | c.localIdx) >>> 0;
      const decodedSource = (packed >>> 27) as Source;
      const decodedLocalIdx = packed & 0x07ffffff;
      expect(decodedSource).toBe(c.source);
      expect(decodedLocalIdx).toBe(c.localIdx);

      // Pick-output packing (with +1).
      const pickPacked = (packed + 1) >>> 0;
      // Decoded the pick way: source from top 5, localIdx = (bottom 27) - 1.
      const pickDecodedSource = (pickPacked >>> 27) as Source;
      const pickDecodedLocalIdx = (pickPacked & 0x07ffffff) - 1;
      expect(pickDecodedSource).toBe(c.source);
      expect(pickDecodedLocalIdx).toBe(c.localIdx);
    }
  });
});

// ─── setBiasMode (Phase 5: collapsed bias-mode dispatch) ──────────────────────
//
// These tests exercise the renderer's single public entry point for bias-mode
// transitions.  Pre-Phase-5 the engine called `applySchechterMode()` /
// `applyAngularReweightMode()` directly and tracked the active mode in two
// places (the engine's `state.bias.mode` AND two private renderer flags) —
// `setBiasMode(mode)` collapses that to one source of truth: the engine
// forwards `state.bias.mode` here, and the renderer's internal flags are
// write-only consequences of this method.
//
// We use the test runner overrides (`setSchechterRatioRunner`,
// `setAngularWeightRunner`) instead of real Vite `?worker` chunks for the
// same reason as the rest of this file — Node has no Worker and we want
// deterministic, synchronous control over how many "worker spawns" happen.
describe('PointRenderer.setBiasMode', () => {
  it('first transition to Schechter spawns the worker once per source', async () => {
    const schechterCalls: { source: Source }[] = [];
    PointRenderer.setSchechterRatioRunner(async (input) => {
      schechterCalls.push({ source: input.source });
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(10));
      await renderer.upload(Source.Glade, makeCloud(20));

      await renderer.setBiasMode(BiasMode.Schechter);
      expect(schechterCalls.length).toBe(2); // SDSS + Glade
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
    }
  });

  it('re-toggle Schechter hits the cache (worker not re-spawned)', async () => {
    let calls = 0;
    PointRenderer.setSchechterRatioRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(10));

      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1);

      await renderer.setBiasMode(BiasMode.None);
      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1); // cache hit, no re-spawn
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
    }
  });

  it('setBiasMode(None) is a no-op for the bake (no worker spawn)', async () => {
    let calls = 0;
    PointRenderer.setSchechterRatioRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    PointRenderer.setAngularWeightRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(10));
      await renderer.setBiasMode(BiasMode.None);
      await renderer.setBiasMode(BiasMode.VolumeLimited);
      expect(calls).toBe(0);
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
      PointRenderer.setAngularWeightRunner(null);
    }
  });

  it('upload arriving mid-Schechter mode bakes the new source eagerly', async () => {
    let calls = 0;
    PointRenderer.setSchechterRatioRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeCloud(10));
      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1);

      // New source arrives while Schechter is active.  upload() reads
      // the renderer's internal mode flag and bakes with-schechter.
      // The bake happens inside `upload` via the build runner, not via
      // a re-call into setBiasMode — `calls` should NOT increment.
      await renderer.upload(Source.Glade, makeCloud(20));
      expect(calls).toBe(1);

      // Re-toggle Schechter→Schechter is a no-op (already active).
      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1);
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
    }
  });
});
