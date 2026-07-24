/**
 * catalogStore — unit tests for the per-catalog GPU-resource bookkeeping.
 *
 * The store owns one vertex buffer (plus fade + source uniforms and their
 * bind groups) per loaded `GalaxyCatalogId`. These tests cover the storage
 * life-cycle — upload / replace / unload, the draw-order iterators, the
 * counts, and the bias-splice byte semantics — none of which touch a
 * pipeline. That is precisely why the store is separable from
 * `pointRenderer`: the questions asked below ("does a parallel rebake stomp
 * the fresh buffer?") can be answered without standing up a stub pipeline.
 *
 * ### Why a stub `GPUDevice`
 *
 * `createCatalogStore` calls real WebGPU APIs (`createBuffer`,
 * `createBindGroup`, `queue.writeBuffer`) that only exist on a live device.
 * The stub's `createBuffer` returns a sentinel (no VRAM) with a `destroy`
 * method so the unload path is observable. Pixel-level assertions need a
 * real browser harness.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SourceType } from '../../../../../src/@types/data/SourceType';
import {
  createCatalogStore,
  type BuildRunner,
} from '../../../../../src/services/gpu/renderers/galaxyCatalog/catalogStore';
import { buildPointInterleavedBuffer } from '../../../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { Source, SOURCE_REGISTRY } from '../../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';

// The store keys its catalogs by the string `GalaxyCatalogId`; these tests
// still reason in terms of the numeric `Source` codes (the `loadedSources()`
// iterator yields `source`), so resolve the id at each upload/unload call
// site through the registry.
function idOf(source: (typeof Source)[keyof typeof Source]): GalaxyCatalogId {
  return SOURCE_REGISTRY[source].id as GalaxyCatalogId;
}

// `GPUBufferUsage` and friends come from the shared
// `tests/setup/webgpuGlobals.ts` setupFile.
//
// Production `upload()` spawns a Vite `?worker` chunk to bake off-thread, but
// `Worker` doesn't exist in Vitest's Node environment.  Every store below is
// therefore constructed with this runner, which routes the bake through the
// same pure function the worker would call — bit-identical behaviour without a
// structured-clone round-trip.
const testRunner: BuildRunner = async (input) => buildPointInterleavedBuffer(input);

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal `GalaxyCatalog` with `count` points. All photometry arrays are
 * filled with safe defaults (zeros) — the store's bookkeeping path never
 * inspects their values, only their lengths.
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
 * A skeletal stand-in for `GPUDevice` — just enough surface area for
 * `createCatalogStore` and its `upload()` / `unload()` to run without
 * throwing. Returned `GPUBuffer`s carry a `destroy` method (called during
 * unload) and a `size` field, but no real GPU memory backs them.
 */
function makeStubDevice(): GPUDevice {
  // Each helper mints a sentinel object that satisfies the structural type
  // the store expects. `as unknown as T` is the standard way to squeeze a
  // stub through TypeScript's strict structural checks.
  const stubBuffer = (): GPUBuffer =>
    ({
      destroy: () => {},
      size: 0,
    }) as unknown as GPUBuffer;

  return {
    createBuffer: () => stubBuffer(),
    createBindGroup: () => ({}) as unknown as GPUBindGroup,
    queue: {
      // `writeBuffer` is invoked from `upload()` and the splice methods.
      // The stub is a no-op; tests that need the bytes use
      // `makeCapturingDevice` below.
      writeBuffer: () => {},
    },
  } as unknown as GPUDevice;
}

// Stub BGLs — createCatalogStore requires fadeBgl + sourceBgl as canonical
// shared layouts (it mints the per-source bind groups against them). These
// stubs satisfy the branded opaque-newtype shape structurally.
function makeStubFadeBgl() {
  return {} as import('../../../../../src/@types/rendering/FadeUniformsBgl').FadeUniformsBgl;
}
function makeStubSourceBgl() {
  return {} as import('../../../../../src/@types/rendering/SourceUniformsBgl').SourceUniformsBgl;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('catalogStore.totalCount', () => {
  it('returns 0 before any upload', () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    expect(store.totalCount()).toBe(0);
  });

  it('sums counts across multiple sources', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(100));
    await store.upload(idOf(Source.TwoMRS), makeCloud(50));
    await store.upload(idOf(Source.Glade), makeCloud(25));
    expect(store.totalCount()).toBe(175);
  });

  it('updates after a source is unloaded', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(100));
    await store.upload(idOf(Source.TwoMRS), makeCloud(50));
    expect(store.totalCount()).toBe(150);

    store.unload(idOf(Source.SDSS));
    expect(store.totalCount()).toBe(50);
  });
});

describe('catalogStore.hasCatalog', () => {
  it('is false before upload, true after, false again after unload', async () => {
    // The survey fade row's guard reads this — it reports whether a catalog's
    // buffer is committed, independent of the slot lifecycle.
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    expect(store.hasCatalog(idOf(Source.SDSS))).toBe(false);
    await store.upload(idOf(Source.SDSS), makeCloud(10));
    expect(store.hasCatalog(idOf(Source.SDSS))).toBe(true);
    expect(store.hasCatalog(idOf(Source.TwoMRS))).toBe(false);
    store.unload(idOf(Source.SDSS));
    expect(store.hasCatalog(idOf(Source.SDSS))).toBe(false);
  });

  it('treats a zero-count upload (the unload signal) as not loaded', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(10));
    await store.upload(idOf(Source.SDSS), makeCloud(0));
    expect(store.hasCatalog(idOf(Source.SDSS))).toBe(false);
  });
});

describe('catalogStore.loadedSources', () => {
  it('iterates clouds in `GALAXY_CATALOG_SOURCES` order regardless of upload order', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    // Upload in non-iteration order on purpose — the store must re-sort.
    // GALAXY_CATALOG_SOURCES is ordered smallest-catalogue → largest:
    //   [Synthetic, Famous, TwoMRS, SDSS, Glade]
    // so TwoMRS comes before SDSS.
    await store.upload(idOf(Source.SDSS), makeCloud(100));
    await store.upload(idOf(Source.TwoMRS), makeCloud(50));

    const entries = Array.from(store.loadedSources());

    // TwoMRS comes before SDSS regardless of upload order.
    expect(entries.map((e) => e.source)).toEqual([Source.TwoMRS, Source.SDSS]);
    expect(entries[0]!.count).toBe(50);
    expect(entries[1]!.count).toBe(100);
  });

  it('drops an unloaded source from the iterator', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.TwoMRS), makeCloud(50));
    await store.upload(idOf(Source.SDSS), makeCloud(100));
    await store.upload(idOf(Source.Glade), makeCloud(25));

    store.unload(idOf(Source.TwoMRS));

    const entries = Array.from(store.loadedSources());
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
describe('catalogStore.upload — regression: replace, not append', () => {
  it('destroys the prior buffer for a source on second upload', async () => {
    // Two clouds with different counts: an "append" bug would leave the
    // sum (1500) in the bookkeeping; a correct "replace" leaves only 500.
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    const cloudA = makeCloud(1000);
    const cloudB = makeCloud(500);

    await store.upload(idOf(Source.SDSS), cloudA);
    const firstEntry = Array.from(store.loadedSources()).find((e) => e.source === Source.SDSS);
    expect(firstEntry).toBeDefined();
    const firstBuffer = firstEntry!.vertexBuffer;

    // Spy on the prior buffer's `destroy` so we observe the lifecycle event.
    // `makeStubDevice` mints a fresh GPUBuffer per `createBuffer` call, so
    // each upload's buffer has its own `destroy` we can spy on independently.
    const destroySpy = vi.spyOn(firstBuffer, 'destroy');

    await store.upload(idOf(Source.SDSS), cloudB);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Bookkeeping reflects the second upload's count, not the sum.
    const secondEntry = Array.from(store.loadedSources()).find((e) => e.source === Source.SDSS);
    expect(secondEntry?.count).toBe(500);

    // And the buffer reference itself has changed — replaced, not patched.
    expect(secondEntry?.vertexBuffer).not.toBe(firstBuffer);
  });
});

// ─── Regression: empty-cloud upload (small-tier exclusion path) ──────────────
//
// `engine.setTier('small')` excludes SDSS (TIER_TARGETS.small[SDSS] === 0)
// and `cloudLoader.reloadSource` fires an empty-cloud (count: 0) callback so
// the store can clear the source's GPU buffer.  The naive path would call
// `device.createBuffer({ size: 0, ... })` which the WebGPU spec forbids
// (OperationError on `size === 0`); the prior buffer would already be
// destroyed by then, leaving the entry in the galaxyCatalogs Map with a destroyed
// buffer reference and the next frame's draw call would fault.
//
// Contract: a count=0 upload destroys the prior buffer, REMOVES the entry
// from `loadedSources()` entirely, and never calls `createBuffer`.  The
// draw loop's existing `if (!entry) continue;` then naturally skips the
// excluded source.
describe('catalogStore.upload — regression: empty-cloud unload', () => {
  it('destroys the prior buffer and removes the entry on a count=0 upload', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(1000));

    const firstEntry = Array.from(store.loadedSources()).find((e) => e.source === Source.SDSS);
    expect(firstEntry).toBeDefined();
    const destroySpy = vi.spyOn(firstEntry!.vertexBuffer, 'destroy');

    // Empty cloud — same shape `cloudLoader.reloadSource` builds when
    // `TIER_TARGETS[tier][source] === 0`.
    await store.upload(idOf(Source.SDSS), makeCloud(0));

    // Prior buffer destroyed (VRAM freed).
    expect(destroySpy).toHaveBeenCalledTimes(1);

    // Entry is GONE from the bookkeeping — not lingering with a broken
    // buffer reference, not lingering with count=0.  Either of those would
    // produce a different failure mode on the next frame.
    const lookup = Array.from(store.loadedSources()).find((e) => e.source === Source.SDSS);
    expect(lookup).toBeUndefined();
    expect(store.totalCount()).toBe(0);
  });

  it('survives upload(0) when no prior cloud exists', async () => {
    // Pathological-but-legal: the engine could in principle call setTier
    // before any cloud has loaded.  Should be a no-op, not a crash.
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await expect(store.upload(idOf(Source.SDSS), makeCloud(0))).resolves.toBeUndefined();
    expect(store.totalCount()).toBe(0);
  });

  it('allows re-uploading a real cloud after an empty-cloud unload', async () => {
    // small → medium swap: SDSS goes from count=0 (excluded) back to count>0
    // (the medium tier file).  The empty-cloud path must leave the store
    // in a state where a subsequent real upload works normally.
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(1000));
    await store.upload(idOf(Source.SDSS), makeCloud(0));
    await store.upload(idOf(Source.SDSS), makeCloud(750));

    const entries = Array.from(store.loadedSources());
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
describe('catalogStore.upload — regression: parallel-upload rebake race', () => {
  it('does not overwrite a concurrent upload during rebake', async () => {
    // Per-source delays: SDSS bakes fast (50 ms), GLADE bakes slow (200 ms).
    // SDSS's post-bake rebake fires while GLADE's worker is still running.
    // Without the fix, SDSS's rebake re-bakes GLADE using the OLD (1.9M)
    // cloud reference and stomps the in-flight GLADE-medium upload.
    const delaysMs = new Map<SourceType, number>([
      [Source.SDSS, 50],
      [Source.Glade, 200],
    ]);
    const delayedRunner: BuildRunner = async (input) => {
      const ms = delaysMs.get(input.source) ?? 0;
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return buildPointInterleavedBuffer(input);
    };

    // The delayed runner is scoped to this store, so no sibling test can
    // pick it up — the whole point of injecting it at construction.
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: delayedRunner,
    });

    // Seed with the "prior tier" layout so the rebake has stale offsets to act on.
    await store.upload(idOf(Source.SDSS), makeCloud(498_227));
    await store.upload(idOf(Source.Glade), makeCloud(1_995_421));

    // Tier swap: kick off both in parallel, the way `engine.setTier` does.
    const sdssPromise = store.upload(idOf(Source.SDSS), makeCloud(156_000));
    const gladePromise = store.upload(idOf(Source.Glade), makeCloud(400_000));

    await Promise.all([sdssPromise, gladePromise]);

    const entries = Array.from(store.loadedSources());
    const sdss = entries.find((e) => e.source === Source.SDSS);
    const glade = entries.find((e) => e.source === Source.Glade);

    expect(sdss?.count).toBe(156_000);
    // The bug surfaced as `glade.count === 1_995_421` here — the rebake
    // resurrected the old large cloud.  The fix keeps GLADE on the new
    // medium cloud the user actually requested.
    expect(glade?.count).toBe(400_000);
  });
});

// ─── Bias-mode bake coverage lives elsewhere ─────────────────────────────────
//
// The bias-bake state machine lives in `biasCorrectionSubsystem.ts`, not the
// store. Its scenarios — fast toggle, cache hit on re-toggle, no-bake for
// identity modes, mid-bake source upload — are covered in
// `tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts`.

// ─── Splice surface ──────────────────────────────────────────────────────────
//
// Three public methods carry the layout-aware splice contract that
// biasCorrectionSubsystem calls into. The tests below assert their
// byte-write semantics.

/**
 * Build a stub device whose `queue.writeBuffer` calls are captured into the
 * supplied array.  Otherwise identical to `makeStubDevice()` — same
 * createBuffer / createBindGroup surface.
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

describe('catalogStore.spliceSchechterRatios', () => {
  it('writes ratios[i] into slot 10 of row i of the interleaved mirror', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const store = createCatalogStore({
      device,
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(3));

    const ratios = new Float32Array([0.25, 0.5, 0.75]);
    store.spliceSchechterRatios(Source.SDSS, ratios);

    // The most-recent writeBuffer call carries the spliced mirror.
    const last = writeCalls[writeCalls.length - 1]!;
    const view = last.data as Float32Array;
    const f32 = new Float32Array(view.buffer, view.byteOffset, view.length);
    // SLOTS_PER_POINT = 14; slot 10 = SCHECHTER_RATIO_BYTE_OFFSET / 4.
    expect(f32[0 * 14 + 10]).toBeCloseTo(0.25);
    expect(f32[1 * 14 + 10]).toBeCloseTo(0.5);
    expect(f32[2 * 14 + 10]).toBeCloseTo(0.75);
  });

  it('throws when ratios.length !== source count', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(5));
    expect(() => store.spliceSchechterRatios(Source.SDSS, new Float32Array(4))).toThrow(/length/i);
  });

  it('is a no-op when the source is not loaded', () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    // Should not throw — subsystem may call this for a stale source mid-bake.
    expect(() => store.spliceSchechterRatios(Source.Glade, new Float32Array(0))).not.toThrow();
  });
});

describe('catalogStore.spliceAngularWeights', () => {
  it('writes weights[i] into slot 11 of row i', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const store = createCatalogStore({
      device,
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(2));

    const weights = new Float32Array([0.1, 0.9]);
    store.spliceAngularWeights(Source.SDSS, weights);

    const last = writeCalls[writeCalls.length - 1]!;
    const view = last.data as Float32Array;
    const f32 = new Float32Array(view.buffer, view.byteOffset, view.length);
    // slot 11 = ANGULAR_WEIGHT_BYTE_OFFSET / 4.
    expect(f32[0 * 14 + 11]).toBeCloseTo(0.1);
    expect(f32[1 * 14 + 11]).toBeCloseTo(0.9);
  });

  it('throws when weights.length !== source count', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(5));
    expect(() => store.spliceAngularWeights(Source.SDSS, new Float32Array(6))).toThrow(/length/i);
  });
});

describe('catalogStore.clearBiasOverlays', () => {
  it('zeroes slots 10 and 11 for the named source', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const store = createCatalogStore({
      device,
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(2));

    // Populate slots 10/11 first so we can assert clear actually clears.
    store.spliceSchechterRatios(Source.SDSS, new Float32Array([0.5, 0.6]));
    store.spliceAngularWeights(Source.SDSS, new Float32Array([0.7, 0.8]));

    writeCalls.length = 0; // reset capture
    store.clearBiasOverlays(Source.SDSS);

    const last = writeCalls[writeCalls.length - 1]!;
    const view = last.data as Float32Array;
    const f32 = new Float32Array(view.buffer, view.byteOffset, view.length);
    expect(f32[0 * 14 + 10]).toBe(0);
    expect(f32[0 * 14 + 11]).toBe(0);
    expect(f32[1 * 14 + 10]).toBe(0);
    expect(f32[1 * 14 + 11]).toBe(0);
  });

  it('zeroes for every loaded source when called with no argument', async () => {
    const writeCalls: { buffer: GPUBuffer; offset: number; data: ArrayBufferView }[] = [];
    const device = makeCapturingDevice(writeCalls);
    const store = createCatalogStore({
      device,
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(1));
    await store.upload(idOf(Source.Glade), makeCloud(1));

    const before = writeCalls.length;
    store.clearBiasOverlays();
    // One writeBuffer per loaded source.
    expect(writeCalls.length - before).toBe(2);
  });

  it('is a no-op when no sources are loaded', () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    expect(() => store.clearBiasOverlays()).not.toThrow();
  });
});
