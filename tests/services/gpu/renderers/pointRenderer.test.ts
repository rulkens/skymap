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
import type { SourceType } from '../../../../src/@types/data/SourceType';
import {
  createPointRenderer,
  setBuildBufferRunner,
} from '../../../../src/services/gpu/renderers/pointRenderer';
import { buildPointInterleavedBuffer } from '../../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { mat4 } from 'gl-matrix';

// `GPUBufferUsage` and friends are populated by the shared
// `tests/setup/webgpuGlobals.ts` setupFile, which runs once per worker
// before any `import` here.  We only retain the beforeAll below to wire
// the bake-runner override.
beforeAll(() => {
  // The production `upload()` spawns a Vite `?worker` chunk to run the bake
  // off-thread.  Vitest loads modules in Node, where `Worker` doesn't exist
  // — instead of trying to polyfill the whole worker harness we just route
  // the bake through the same pure function the worker would call.  Tests
  // get bit-identical behaviour without any structured-clone round-trip.
  //
  // Spec E phase E.4 moved `setBuildBufferRunner` from a class static
  // (`setBuildBufferRunner(...)`) to a module-level export
  // (the bare `setBuildBufferRunner(...)` imported above).  See the
  // function's docstring in pointRenderer.ts for the rationale.
  setBuildBufferRunner(async (input) => buildPointInterleavedBuffer(input));
});

afterAll(() => {
  setBuildBufferRunner(null);
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal `GalaxyCatalog` with `count` points. All photometry arrays are
 * filled with safe defaults (zeros) — the renderer's bookkeeping path never
 * inspects their values, only their lengths.
 */
function makeCloud(count: number): GalaxyCatalog {
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
    // v5 per-record metadata bytes; zero-filled for non-Milliquas test
    // fixtures (the renderer's bookkeeping path doesn't read them).
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
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
      // `writeBuffer` is invoked from `upload()` (and per-frame from `draw()`).
      // The stub is a no-op — none of the tests below call `draw()`.
      writeBuffer: () => {},
    },
  } as unknown as GPUDevice;
}

// Stub BGLs for the unified-fade architecture — createPointRenderer now
// requires fadeBgl + sourceBgl as canonical shared layouts.  The stub
// objects satisfy the branded opaque-newtype shape structurally.
function makeStubFadeBgl() {
  return {} as import('../../../../src/@types/rendering/FadeUniformsBgl').FadeUniformsBgl;
}
function makeStubSourceBgl() {
  return {} as import('../../../../src/@types/rendering/SourceUniformsBgl').SourceUniformsBgl;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PointRenderer.totalCount', () => {
  it('returns 0 before any upload', () => {
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    expect(renderer.totalCount()).toBe(0);
  });

  it('sums counts across multiple sources', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    await renderer.upload(Source.Glade, makeCloud(25));
    expect(renderer.totalCount()).toBe(175);
  });

  it('updates after a source is unloaded', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(100));
    await renderer.upload(Source.TwoMRS, makeCloud(50));
    expect(renderer.totalCount()).toBe(150);

    renderer.unload(Source.SDSS);
    expect(renderer.totalCount()).toBe(50);
  });
});

describe('PointRenderer.loadedSources', () => {
  it('iterates clouds in `SURVEY_SOURCES` order regardless of upload order', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    // Upload in non-iteration order on purpose — the renderer must re-sort.
    // SURVEY_SOURCES is ordered smallest-catalogue → largest:
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
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
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
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    const cloudA = makeCloud(1000);
    const cloudB = makeCloud(500);

    await renderer.upload(Source.SDSS, cloudA);
    const firstEntry = Array.from(renderer.loadedSources()).find((e) => e.source === Source.SDSS);
    expect(firstEntry).toBeDefined();
    const firstBuffer = firstEntry!.vertexBuffer;

    // Spy on the prior buffer's `destroy` so we observe the lifecycle event.
    // `makeStubDevice` mints a fresh GPUBuffer per `createBuffer` call, so
    // each upload's buffer has its own `destroy` we can spy on independently.
    const destroySpy = vi.spyOn(firstBuffer, 'destroy');

    await renderer.upload(Source.SDSS, cloudB);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Bookkeeping reflects the second upload's count, not the sum.
    const secondEntry = Array.from(renderer.loadedSources()).find((e) => e.source === Source.SDSS);
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
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(1000));

    const firstEntry = Array.from(renderer.loadedSources()).find((e) => e.source === Source.SDSS);
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
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    await expect(renderer.upload(Source.SDSS, makeCloud(0))).resolves.toBeUndefined();
    expect(renderer.totalCount()).toBe(0);
  });

  it('allows re-uploading a real cloud after an empty-cloud unload', async () => {
    // small → medium swap: SDSS goes from count=0 (excluded) back to count>0
    // (the medium tier file).  The empty-cloud path must leave the renderer
    // in a state where a subsequent real upload works normally.
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
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
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());

    // Seed with the "prior tier" layout so the rebake has stale offsets to act on.
    await renderer.upload(Source.SDSS, makeCloud(498_227));
    await renderer.upload(Source.Glade, makeCloud(1_995_421));

    // Build per-source delays: SDSS bakes fast (50 ms), GLADE bakes slow
    // (200 ms).  SDSS's post-bake rebake fires while GLADE's worker is still
    // running.  Without the fix, SDSS's rebake re-bakes GLADE using the OLD
    // (1.9M) cloud reference and stomps the in-flight GLADE-medium upload.
    const delaysMs = new Map<SourceType, number>([
      [Source.SDSS, 50],
      [Source.Glade, 200],
    ]);
    setBuildBufferRunner(async (input) => {
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
      setBuildBufferRunner(async (input) => buildPointInterleavedBuffer(input));
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
    function packedIdentitiesFor(source: SourceType, count: number): Set<number> {
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
    const cases: Array<{ source: SourceType; localIdx: number }> = [
      { source: Source.Synthetic, localIdx: 0 },
      { source: Source.Famous, localIdx: 17 },
      { source: Source.TwoMRS, localIdx: 38_000 },
      { source: Source.SDSS, localIdx: 500_000 },
      { source: Source.Glade, localIdx: 2_000_000 },
    ];
    for (const c of cases) {
      // Selection-halo packing (no +1).
      const packed = ((c.source << 27) | c.localIdx) >>> 0;
      const decodedSource = (packed >>> 27) as SourceType;
      const decodedLocalIdx = packed & 0x07ffffff;
      expect(decodedSource).toBe(c.source);
      expect(decodedLocalIdx).toBe(c.localIdx);

      // Pick-output packing (with +1).
      const pickPacked = (packed + 1) >>> 0;
      // Decoded the pick way: source from top 5, localIdx = (bottom 27) - 1.
      const pickDecodedSource = (pickPacked >>> 27) as SourceType;
      const pickDecodedLocalIdx = (pickPacked & 0x07ffffff) - 1;
      expect(pickDecodedSource).toBe(c.source);
      expect(pickDecodedLocalIdx).toBe(c.localIdx);
    }
  });
});

// ─── Bias-mode tests deleted (Spec E phase E.4) ──────────────────────────────
//
// Pre-E.4 this file held a `describe('PointRenderer.setBiasMode', …)` block
// that exercised the renderer's `setBiasMode` / `setSchechterRatioRunner` /
// `setAngularWeightRunner` surface.  Phase E.4 deleted that surface from
// PointRenderer (the bake state machine moved to `biasCorrectionSubsystem.ts`).
// The same scenarios — fast toggle, cache hit on re-toggle, no-bake for
// identity modes, mid-bake source upload — are covered at the right layer
// in `tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts`
// under the named race tests `fast_toggle_race`, `mid_bake_upload_race`,
// `multi_source_completion_ordering`, plus `attach_before_setMode` /
// `attach_after_setMode_completes` for the renderer-attach edges.

// ─── Splice surface (Spec E phase E.1) ───────────────────────────────────────
//
// Three new public methods carry the layout-aware splice contract that the
// future biasCorrectionSubsystem (Spec E phase E.3) will call into.  In
// E.1 they're dead code from the public surface's POV — no caller invokes
// them yet — but the tests below assert their byte-write semantics so the
// surface is verified before the subsystem depends on it.

/**
 * Build a stub device whose `queue.writeBuffer` calls are captured into the
 * supplied array.  Otherwise identical to `makeStubDevice()` — same
 * createShaderModule / createRenderPipeline / createBuffer surface.
 */
function makeCapturingDevice(
  writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[],
): GPUDevice {
  const device = makeStubDevice();
  (
    device.queue as unknown as {
      writeBuffer: (b: GPUBuffer, o: number, d: ArrayBufferView) => void;
    }
  ).writeBuffer = (buffer, offset, data) => {
    writeCalls.push({ buffer, offset, data });
  };
  return device;
}

describe('PointRenderer.spliceSchechterRatios', () => {
  it('writes ratios[i] into slot 9 of row i of the interleaved mirror', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(3));

    const ratios = new Float32Array([0.25, 0.5, 0.75]);
    renderer.spliceSchechterRatios(Source.SDSS, ratios);

    // The most-recent writeBuffer call carries the spliced mirror.
    const last = writeCalls[writeCalls.length - 1]!;
    const view = last.data as Float32Array;
    const f32 = new Float32Array(view.buffer, view.byteOffset, view.length);
    // SLOTS_PER_POINT = 11; slot 9 = SCHECHTER_RATIO_BYTE_OFFSET / 4.
    expect(f32[0 * 11 + 9]).toBeCloseTo(0.25);
    expect(f32[1 * 11 + 9]).toBeCloseTo(0.5);
    expect(f32[2 * 11 + 9]).toBeCloseTo(0.75);
  });

  it('throws when ratios.length !== source count', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(5));
    expect(() => renderer.spliceSchechterRatios(Source.SDSS, new Float32Array(4))).toThrow(
      /length/i,
    );
  });

  it('is a no-op when the source is not loaded', () => {
    const renderer = createPointRenderer(makeStubDevice(), 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    // Should not throw — subsystem may call this for a stale source mid-bake.
    expect(() => renderer.spliceSchechterRatios(Source.Glade, new Float32Array(0))).not.toThrow();
  });
});

describe('PointRenderer.spliceAngularWeights', () => {
  it('writes weights[i] into slot 10 of row i', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(2));

    const weights = new Float32Array([0.1, 0.9]);
    renderer.spliceAngularWeights(Source.SDSS, weights);

    const last = writeCalls[writeCalls.length - 1]!;
    const view = last.data as Float32Array;
    const f32 = new Float32Array(view.buffer, view.byteOffset, view.length);
    // slot 10 = ANGULAR_WEIGHT_BYTE_OFFSET / 4.
    expect(f32[0 * 11 + 10]).toBeCloseTo(0.1);
    expect(f32[1 * 11 + 10]).toBeCloseTo(0.9);
  });

  it('throws when weights.length !== source count', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(5));
    expect(() => renderer.spliceAngularWeights(Source.SDSS, new Float32Array(6))).toThrow(
      /length/i,
    );
  });
});

describe('PointRenderer.clearBiasOverlays', () => {
  it('zeroes slots 9 and 10 for the named source', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(2));

    // Populate slots 9/10 first so we can assert clear actually clears.
    renderer.spliceSchechterRatios(Source.SDSS, new Float32Array([0.5, 0.6]));
    renderer.spliceAngularWeights(Source.SDSS, new Float32Array([0.7, 0.8]));

    writeCalls.length = 0; // reset capture
    renderer.clearBiasOverlays(Source.SDSS);

    const last = writeCalls[writeCalls.length - 1]!;
    const view = last.data as Float32Array;
    const f32 = new Float32Array(view.buffer, view.byteOffset, view.length);
    expect(f32[0 * 11 + 9]).toBe(0);
    expect(f32[0 * 11 + 10]).toBe(0);
    expect(f32[1 * 11 + 9]).toBe(0);
    expect(f32[1 * 11 + 10]).toBe(0);
  });

  it('zeroes for every loaded source when called with no argument', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(1));
    await renderer.upload(Source.Glade, makeCloud(1));

    const before = writeCalls.length;
    renderer.clearBiasOverlays();
    // One writeBuffer per loaded source.
    expect(writeCalls.length - before).toBe(2);
  });

  it('is a no-op when no sources are loaded', () => {
    const renderer = createPointRenderer(makeStubDevice(), 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    expect(() => renderer.clearBiasOverlays()).not.toThrow();
  });
});

// ─── PointRenderer.destroy() ─────────────────────────────────────────────────
//
// PointRenderer owns the app's largest GPU allocations (per-source vertex
// buffers ~14 MB each plus per-source fade + source uniform buffers plus
// its own per-frame uniform buffer).  WebGPU buffers don't release via JS GC alone —
// `GPUBuffer.destroy()` is mandatory.  These tests assert that
// `PointRenderer.destroy()` actually fires destroy on every owned buffer
// and clears the per-source map, so the engine.ts teardown chain plateaus
// browser GPU memory across HMR / StrictMode remount cycles instead of
// climbing.
//
// We extend the stub device with a *tracking* buffer factory: every
// `createBuffer` call returns a fresh stub whose `destroy()` increments a
// shared counter we can assert against.  The renderer creates three buffers
// per upload (vertex buffer, FadeUniforms 16-byte uniform, SourceUniforms
// 16-byte uniform — unified-fade architecture) and one buffer up-front for
// its own `uniformBuffer_internal`.  We can therefore predict the exact
// destroy fan-out for any given upload sequence.

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

describe('PointRenderer.destroy', () => {
  it("releases the renderer's uniform buffer", () => {
    const buffers: TrackedBuffer[] = [];
    const device = makeDestroyTrackingDevice(buffers);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    // The constructor allocates exactly one buffer — `uniformBuffer_internal`.
    expect(buffers).toHaveLength(1);
    const uniformBuffer = buffers[0]!;
    expect(uniformBuffer.destroyCount).toBe(0);

    renderer.destroy();

    expect(uniformBuffer.destroyCount).toBe(1);
  });

  it('releases each per-source buffer + fade uniform', async () => {
    const buffers: TrackedBuffer[] = [];
    const device = makeDestroyTrackingDevice(buffers);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    // Constructor allocates 1 buffer (the renderer's own uniform).
    expect(buffers).toHaveLength(1);

    await renderer.upload(Source.SDSS, makeCloud(2));
    // upload() allocates 3 more buffers per source: the vertex buffer,
    // the FadeUniforms 16-byte uniform, and the SourceUniforms 16-byte
    // uniform (unified-fade architecture).
    expect(buffers).toHaveLength(4);

    await renderer.upload(Source.TwoMRS, makeCloud(3));
    // Second source: another vertex + fade + source triple.
    expect(buffers).toHaveLength(7);

    // Sanity: every tracked buffer starts at 0 destroys.
    for (const b of buffers) expect(b.destroyCount).toBe(0);

    renderer.destroy();

    // All seven buffers (1 renderer uniform + 2 sources × {vertex, fade, source})
    // should be destroyed exactly once.
    for (const b of buffers) expect(b.destroyCount).toBe(1);
  });

  it('clears the clouds map', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(2));
    await renderer.upload(Source.TwoMRS, makeCloud(3));
    expect(Array.from(renderer.loadedSources())).toHaveLength(2);

    renderer.destroy();

    expect(Array.from(renderer.loadedSources())).toHaveLength(0);
  });

  it('is idempotent — safe to call twice without throwing', async () => {
    const buffers: TrackedBuffer[] = [];
    const device = makeDestroyTrackingDevice(buffers);
    const renderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(1));

    expect(() => renderer.destroy()).not.toThrow();
    // Second call iterates an empty clouds map and re-destroys the
    // already-destroyed uniform buffer.  WebGPU's spec defines
    // `GPUBuffer.destroy()` as idempotent; our stub mirrors that by
    // simply incrementing the counter — the test's contract is "no
    // throw", not "destroyCount stays at 1".
    expect(() => renderer.destroy()).not.toThrow();
  });
});

describe('PointRenderer.draw — PointDrawSettings shape', () => {
  it('accepts a single PointDrawSettings record', async () => {
    const renderer = createPointRenderer(makeStubDevice(), 'bgra8unorm', makeStubFadeBgl(), makeStubSourceBgl());
    await renderer.upload(Source.SDSS, makeCloud(10));

    // Stub the encoder.  draw() must call setPipeline + setBindGroup + draw
    // once (one source loaded, one passing visibility bit).
    const calls: string[] = [];
    const pass = {
      setPipeline: () => calls.push('setPipeline'),
      setBindGroup: () => calls.push('setBindGroup'),
      setVertexBuffer: () => calls.push('setVertexBuffer'),
      draw: () => calls.push('draw'),
    } as unknown as GPURenderPassEncoder;

    const viewProj = new Float32Array(16) as unknown as mat4;

    renderer.draw(pass, viewProj, [800, 600], {
      pointSizePx: 1,
      brightness: 1,
      selectedPacked: 0xffffffff >>> 0,
      visibleSourceMask: 0xffffffff,
      camPosWorld: [0, 0, 0],
      pxPerRad: 1,
      highlightFallback: false,
      realOnlyMode: false,
      biasMode: 0,
      absMagLimit: 0,
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
      depthFadeEnabled: false,
      pxFadeStart: 0,
      pxFadeEnd: 0,
      fadeOpacityOf: () => 1,
    });

    expect(calls).toContain('setPipeline');
    expect(calls).toContain('draw');
  });
});

describe('POINT_VERTEX_ATTRIBUTES — shared layout export', () => {
  it('has 9 attributes with the expected shader locations and formats', async () => {
    const {
      POINT_VERTEX_ATTRIBUTES,
      POINT_STRIDE,
    } = await import('../../../../src/services/gpu/renderers/pointRenderer');

    expect(POINT_STRIDE).toBe(44);
    expect(POINT_VERTEX_ATTRIBUTES).toHaveLength(9);

    // Slot 0 is the only vec3; slots 1-8 are scalar f32s.  Anyone editing
    // pointRenderer's table must update this expectation deliberately,
    // which is the point — a silent shape change here would break the
    // shared invariant with pickRenderer.
    expect(POINT_VERTEX_ATTRIBUTES[0]).toEqual({
      shaderLocation: 0,
      offset: 0,
      format: 'float32x3',
    });

    const expectedOffsets = [12, 16, 20, 24, 28, 32, 36, 40];
    for (let i = 1; i <= 8; i++) {
      expect(POINT_VERTEX_ATTRIBUTES[i]).toEqual({
        shaderLocation: i,
        offset: expectedOffsets[i - 1],
        format: 'float32',
      });
    }
  });
});
