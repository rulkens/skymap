/**
 * galaxyCatalogSourceRegistry — unit tests for the galaxy-catalog source slot wiring helper.
 *
 * The 5 galaxy-catalog source slots (SDSS, 2MRS, GLADE, Famous, Synthetic)
 * all share one slot construction shape: name = `${sourceName}-points`,
 * upload-on-commit, requestRender + `onCatalogReady` echo on the `ready`
 * transition.  Pre-Phase-4 the body lived inline as a single 60-line
 * loop in `engine.ts`'s bootstrap IIFE.  Phase 4 lifts the per-source
 * variance into a declarative `GALAXY_CATALOG_SOURCE_REGISTRY` and reduces the
 * loop to one helper call per source.
 *
 * These tests verify the helper's contract without spinning up the full
 * engine:
 *   - each `wireGalaxyCatalogSourceSlot` call mints a slot, subscribes to it,
 *     and stores it in `state.assetSlots.points` keyed by `Source`;
 *   - the subscriber fires `cb.onCatalogReady(source, count)` and
 *     `requestRender()` on the `ready` transition, and is silent on
 *     the loading / committing / error transitions;
 *   - the commit step routes through the shared
 *     `commitGalaxyCatalogToRenderer` helper (uploads to the renderer,
 *     mutates `state.sources.catalogs`);
 *   - multiple sources wired in succession produce independent slots
 *     keyed correctly — no cross-talk between SDSS and GLADE;
 *   - `GALAXY_CATALOG_SOURCE_REGISTRY` declares exactly the 5 expected sources
 *     in the same Source enum order the engine has used since Spec A.
 *
 * We intentionally do NOT exercise the AssetSlot's full retry-policy or
 * race-checking — `AssetSlot.test.ts` and the slot's own suite cover
 * that.  This suite is about the *plumbing* between the registry, the
 * helper, and `state.assetSlots.points`.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  wireGalaxyCatalogSourceSlot,
} from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import type { GalaxyCatalogSourceConfig } from '../../../../src/@types/engine/wiring/GalaxyCatalogSourceConfig';
import type { WirePointSourceDeps } from '../../../../src/@types/engine/wiring/WirePointSourceDeps';
import { Source } from '../../../../src/data/sources';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

/**
 * Minimal-shape fixture for the `EngineState` slices the helper reads
 * and writes: `gpu.renderer` (the upload target), `sources.catalogs`
 * (mutated on commit), `subsystems.scheduler.requestRender` (woken on
 * ready), and the `assetSlots.points` Map (where the helper stores the
 * minted slot).  Casting through `unknown` keeps the test honest — any
 * field the helper reaches for outside this set surfaces as a runtime
 * undefined.
 */
function makeState(opts: {
  rendererUpload: ReturnType<typeof vi.fn>;
  loadedSources?: Iterable<{ source: Source; count: number }>;
}): EngineState {
  const catalogs = new Map<Source, GalaxyCatalog>();
  return {
    gpu: {
      renderer: {
        upload: opts.rendererUpload,
        loadedSources: () => opts.loadedSources ?? [],
        totalCount: () => 0,
      },
    },
    sources: {
      catalogs,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
    },
    assetSlots: {
      points: new Map(),
    },
  } as unknown as EngineState;
}

/**
 * Build a tiny `GalaxyCatalog`-shaped fixture.  Only `count` is read by
 * the subscriber's `onCatalogReady` echo and by the upload log line.
 */
function fakeCloud(count: number): GalaxyCatalog {
  return { count } as unknown as GalaxyCatalog;
}

describe('GALAXY_CATALOG_SOURCE_REGISTRY', () => {
  it('declares exactly the 5 expected sources in Source enum order', () => {
    const sources = GALAXY_CATALOG_SOURCE_REGISTRY.map((c) => c.source);
    expect(sources).toEqual([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Famous,
      Source.Synthetic,
    ]);
  });

  it('uses the shared galaxyCatalogFetcher for the four real surveys and the dedicated synthetic fetcher for Synthetic', () => {
    // We don't import the fetchers here to avoid coupling to their
    // implementation — but we can verify the structural invariant
    // "Synthetic's fetcher is not the same reference as the other four".
    const real = GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.source !== Source.Synthetic);
    const synthetic = GALAXY_CATALOG_SOURCE_REGISTRY.find((c) => c.source === Source.Synthetic);
    expect(synthetic).toBeDefined();
    const realFetchers = new Set(real.map((c) => c.fetcher));
    expect(realFetchers.size).toBe(1); // all four real surveys share one fetcher
    expect(synthetic!.fetcher).not.toBe(real[0]!.fetcher);
  });
});

describe('wireGalaxyCatalogSourceSlot', () => {
  function makeDeps(cb: Partial<EngineCallbacks> = {}): WirePointSourceDeps {
    return { cb: cb as EngineCallbacks };
  }

  it('builds a slot and stores it in state.assetSlots.points keyed by Source', () => {
    const state = makeState({ rendererUpload: vi.fn().mockResolvedValue(undefined) });
    const cfg: GalaxyCatalogSourceConfig = GALAXY_CATALOG_SOURCE_REGISTRY.find(
      (c) => c.source === Source.SDSS,
    )!;

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.SDSS);
    expect(slot).toBeDefined();
    expect(slot!.name).toBe('sdss-points');
    expect(slot!.state().kind).toBe('idle');
  });

  it('produces independent slots for each source — no cross-talk', () => {
    const state = makeState({ rendererUpload: vi.fn().mockResolvedValue(undefined) });
    const sdssCfg = GALAXY_CATALOG_SOURCE_REGISTRY.find((c) => c.source === Source.SDSS)!;
    const gladeCfg = GALAXY_CATALOG_SOURCE_REGISTRY.find((c) => c.source === Source.Glade)!;

    wireGalaxyCatalogSourceSlot(state, sdssCfg, makeDeps());
    wireGalaxyCatalogSourceSlot(state, gladeCfg, makeDeps());

    const sdssSlot = state.assetSlots.points.get(Source.SDSS);
    const gladeSlot = state.assetSlots.points.get(Source.Glade);
    expect(sdssSlot).toBeDefined();
    expect(gladeSlot).toBeDefined();
    expect(sdssSlot).not.toBe(gladeSlot);
    expect(sdssSlot!.name).toBe('sdss-points');
    expect(gladeSlot!.name).toBe('glade-points');
  });

  it('subscribes a handler that fires onCatalogReady(source, count) and requestRender on the ready transition', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const onCatalogReady = vi.fn();
    // Nested-only fire shape (H5 task 11): the registry fires
    // `cb.sources?.onCatalogReady?.(...)` on the ready transition.
    const cb: Partial<EngineCallbacks> = { sources: { onCatalogReady } };
    // Use a stub fetcher so we control when the slot transitions to ready.
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      fetcher: async () => fakeCloud(42),
      initialTier: 'medium',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps(cb));

    const slot = state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    // Drive microtasks so the slot's fetch + commit chain settles.
    // The slot's commit awaits the renderer upload; once that resolves
    // the state transitions to 'ready' and the subscriber fires.
    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(onCatalogReady).toHaveBeenCalledOnce();
    expect(onCatalogReady).toHaveBeenCalledWith(Source.SDSS, 42);
    // requestRender fires once on the ready transition.
    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalled();
  });

  it("commit uploads the cloud to the renderer and writes it into state.sources.catalogs", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const cloud = fakeCloud(7);
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.Glade,
      fetcher: async () => cloud,
      initialTier: 'small',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.Glade)!;
    slot.load({ source: Source.Glade, tier: 'small' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    // Upload was called with (source, cloud) — the renderer's contract.
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(Source.Glade, cloud);
    // sources.catalogs was populated post-upload.
    expect(state.sources.catalogs.get(Source.Glade)).toBe(cloud);
  });

  it('skips the upload silently when state.gpu.renderer is null (post-destroy / pre-init race)', async () => {
    const state = makeState({ rendererUpload: vi.fn() });
    // Simulate the renderer having been torn down before commit fires.
    (state.gpu as unknown as { renderer: null }).renderer = null;

    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.TwoMRS,
      fetcher: async () => fakeCloud(3),
      initialTier: 'medium',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.TwoMRS)!;
    slot.load({ source: Source.TwoMRS, tier: 'medium' });

    // The commit body is async but runs to completion even with a null
    // renderer — it just becomes a no-op.  The slot still transitions
    // to 'ready' afterward, which is the contract every other test
    // path here relies on.
    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    // sources.catalogs NOT populated — the upload was skipped.
    expect(state.sources.catalogs.has(Source.TwoMRS)).toBe(false);
  });
});
