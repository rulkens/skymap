/**
 * catalogStore — unit tests for the per-catalog GPU-resource bookkeeping.
 *
 * The store owns one vertex buffer (plus fade + source uniforms and their
 * bind groups) per loaded `GalaxyCatalogId`. These tests cover the storage
 * life-cycle — upload / replace / unload, the draw-order iterators and the
 * counts — none of which touch a pipeline. That is precisely why the store is separable from
 * `galaxyPointRenderer`: the questions asked below ("does a parallel rebake stomp
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
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { createCatalogStore } from '../../../../src/layers/galaxyCatalog/render/catalogStore';
import type { BuildRunner } from '../../../../src/layers/galaxyCatalog/@types/BuildRunner';
import { buildPointInterleavedBuffer } from '../../../../src/services/engine/bake/buildPointInterleavedBuffer';
import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

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
      writeBuffer: () => {},
    },
  } as unknown as GPUDevice;
}

// Stub BGLs — createCatalogStore requires fadeBgl + sourceBgl as canonical
// shared layouts (it mints the per-source bind groups against them). These
// stubs satisfy the branded opaque-newtype shape structurally.
function makeStubFadeBgl() {
  return {} as import('../../../../src/@types/rendering/FadeUniformsBgl').FadeUniformsBgl;
}
function makeStubSourceBgl() {
  return {} as import('../../../../src/@types/rendering/SourceUniformsBgl').SourceUniformsBgl;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('catalogStore.totalCount', () => {
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
});

describe('catalogStore.unload', () => {
  it('destroys the catalog buffers and forgets the entry', async () => {
    const destroyed: number[] = [];
    let minted = 0;
    const device = makeStubDevice();
    (device as unknown as { createBuffer: () => GPUBuffer }).createBuffer = () => {
      const n = minted++;
      return { destroy: () => destroyed.push(n), size: 0 } as unknown as GPUBuffer;
    };
    const store = createCatalogStore({
      device,
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(10));
    expect(destroyed).toEqual([]);

    store.unload(idOf(Source.SDSS));

    expect(destroyed.length).toBe(minted);
    expect(store.hasCatalog(idOf(Source.SDSS))).toBe(false);
  });

  it('leaves the store able to take a fresh upload afterwards (tier down, then up)', async () => {
    const store = createCatalogStore({
      device: makeStubDevice(),
      fadeBgl: makeStubFadeBgl(),
      sourceBgl: makeStubSourceBgl(),
      buildRunner: testRunner,
    });
    await store.upload(idOf(Source.SDSS), makeCloud(1000));
    store.unload(idOf(Source.SDSS));
    await store.upload(idOf(Source.SDSS), makeCloud(750));

    expect(Array.from(store.loadedSources()).map((e) => e.count)).toEqual([750]);
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
    //   [Famous, TwoMRS, SDSS, Glade]
    // so TwoMRS comes before SDSS.
    await store.upload(idOf(Source.SDSS), makeCloud(100));
    await store.upload(idOf(Source.TwoMRS), makeCloud(50));

    const entries = Array.from(store.loadedSources());

    // TwoMRS comes before SDSS regardless of upload order.
    expect(entries.map((e) => e.source)).toEqual([Source.TwoMRS, Source.SDSS]);
    expect(entries[0]!.count).toBe(50);
    expect(entries[1]!.count).toBe(100);
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
    // Per-source delays: SDSS bakes fast, GLADE ~15x slower, so SDSS's
    // post-bake rebake reliably fires while GLADE's worker is still running.
    // Without the fix, SDSS's rebake re-bakes GLADE using the OLD (larger)
    // cloud reference and stomps the in-flight GLADE-medium upload.
    const delaysMs = new Map<SourceType, number>([
      [Source.SDSS, 2],
      [Source.Glade, 30],
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

    // Seed with the "prior tier" layout so the rebake has stale offsets to act
    // on. Counts only have to differ from the new ones — the race is in the
    // ordering, not the volume — so these stand in for the real ~0.5M/2M tiers.
    await store.upload(idOf(Source.SDSS), makeCloud(497));
    await store.upload(idOf(Source.Glade), makeCloud(1995));

    // Tier swap: kick off both in parallel, the way `engine.setTier` does.
    const sdssPromise = store.upload(idOf(Source.SDSS), makeCloud(156));
    const gladePromise = store.upload(idOf(Source.Glade), makeCloud(400));

    await Promise.all([sdssPromise, gladePromise]);

    const entries = Array.from(store.loadedSources());
    const sdss = entries.find((e) => e.source === Source.SDSS);
    const glade = entries.find((e) => e.source === Source.Glade);

    expect(sdss?.count).toBe(156);
    // The bug surfaced as `glade.count === 1995` here — the rebake resurrected
    // the old large cloud.  The fix keeps GLADE on the new medium cloud the
    // user actually requested.
    expect(glade?.count).toBe(400);
  });
});
