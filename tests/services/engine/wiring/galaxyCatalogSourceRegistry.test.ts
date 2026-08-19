/**
 * galaxyCatalogSourceRegistry — unit tests for the galaxy-catalog
 * source slot wiring helper.
 *
 * The galaxy-catalog source slots (SDSS, 2MRS, GLADE, Famous,
 * Milliquas, DESI Deep, DESI Wedge, DESI SGW, Synthetic) all share one slot construction shape:
 * name = `${shortName}-points`, upload-on-commit, `onCatalogReady`
 * echo on the `ready` transition.  The per-source variance lives in a
 * declarative `GALAXY_CATALOG_SOURCE_REGISTRY`; `wireGalaxyCatalogSourceSlot`
 * is called once per row.
 *
 * These tests verify the helper's contract without spinning up the
 * full engine:
 *   - each `wireGalaxyCatalogSourceSlot` call mints a slot, subscribes
 *     to it, and stores it in `state.assetSlots.points` keyed by
 *     `Source`;
 *   - the subscriber fires `cb.onCatalogReady(source, count)` on the
 *     `ready` transition, and is silent on the loading / committing /
 *     error transitions (the render wake is covered generically by
 *     `installSlotReadyWake.test.ts`);
 *   - the commit step uploads to the renderer and mutates
 *     `state.sources.catalogs`;
 *   - multiple sources wired in succession produce independent slots
 *     keyed correctly — no cross-talk between SDSS and GLADE;
 *   - `GALAXY_CATALOG_SOURCE_REGISTRY` declares the expected sources
 *     in Source enum order.
 *
 * AssetSlot retry-policy / race-checking is covered by
 * `AssetSlot.test.ts`.  This suite is about the *plumbing* between
 * the registry, the helper, and `state.assetSlots.points`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// The commit's first-load fade-in routes through the bridge; mock it to a typed
// no-op so these slot-plumbing tests (upload + onCatalogReady) don't have to
// stand up full settings/sources state for the real per-row fade walk.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
  // The slot commit drives its fade-in through the single-item entry; mock it
  // too so the commit's bridge call is a no-op here (this file tests upload /
  // commit mechanics, not the fade — that lives in the sibling Fade test).
  syncVisibilityFadeItem:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFadeItem
    >(),
}));

import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  GALAXY_CATALOG_POINT_SOURCES,
  TIER_FETCHED_POINT_SOURCES,
  wireGalaxyCatalogSourceSlot,
} from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import type { GalaxyCatalogSourceConfig } from '../../../../src/@types/engine/wiring/GalaxyCatalogSourceConfig';
import type { WirePointSourceDeps } from '../../../../src/@types/engine/wiring/WirePointSourceDeps';
import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { engineSourceCountReported } from '../../../../src/state/engine/engineSlice';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * Minimal-shape fixture for the `EngineState` slices the helper reads
 * and writes: `gpu.galaxyPointRenderer` (the upload target), `sources.catalogs`
 * (mutated on commit), `subsystems.scheduler.requestRender` (woken on
 * ready), and the `assetSlots.points` Map (where the helper stores the
 * minted slot).  Casting through `unknown` keeps the test honest — any
 * field the helper reaches for outside this set surfaces as a runtime
 * undefined.
 */
function makeState(opts: {
  rendererUpload: ReturnType<typeof vi.fn>;
  loadedSources?: Iterable<{ source: SourceType; count: number }>;
  fadesStub?: Record<string, unknown>;
}): EngineState {
  return {
    gpu: {
      galaxyPointRenderer: {
        upload: opts.rendererUpload,
        loadedSources: () => opts.loadedSources ?? [],
        totalCount: () => 0,
      },
    },
    data: createEngineData(),
    subsystems: {
      fades: opts.fadesStub ?? {
        register: vi.fn(),
        unregister: vi.fn(),
        fadeTo: vi.fn(() => Promise.resolve()),
        setImmediate: vi.fn(),
        opacityOf: vi.fn(() => 1),
        isAnyAnimating: vi.fn(() => false),
        tick: vi.fn(),
        destroy: vi.fn(),
        label: 'fadeRegistry',
      },
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
  it('declares exactly the 9 expected sources in Source enum order', () => {
    const sources = GALAXY_CATALOG_SOURCE_REGISTRY.map((c) => c.source);
    expect(sources).toEqual([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.FamousGalaxy,
      Source.Milliquas,
      Source.DesiDeep,
      Source.DesiWedge,
      Source.DesiSgw,
      Source.Synthetic,
    ]);
  });

  it('uses the shared galaxyCatalogFetcher for the eight real galaxy catalogs and the dedicated synthetic fetcher for Synthetic', () => {
    // We don't import the fetchers here to avoid coupling to their
    // implementation — but we can verify the structural invariant
    // "Synthetic's fetcher is not the same reference as the others".
    const real = GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.source !== Source.Synthetic);
    const synthetic = GALAXY_CATALOG_SOURCE_REGISTRY.find((c) => c.source === Source.Synthetic);
    expect(synthetic).toBeDefined();
    const realFetchers = new Set(real.map((c) => c.fetcher));
    expect(realFetchers.size).toBe(1); // all eight real galaxy catalogs share one fetcher
    expect(synthetic!.fetcher).not.toBe(real[0]!.fetcher);
  });

  it('derives GALAXY_CATALOG_POINT_SOURCES from rows with category="survey"', () => {
    // Pin the consolidation invariant: anything that the boot-time
    // synthetic-fallback gate consults must come from the registry,
    // never from a hardcoded enum literal scattered elsewhere.
    expect([...GALAXY_CATALOG_POINT_SOURCES]).toEqual([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.Milliquas,
      Source.DesiDeep,
      Source.DesiWedge,
      Source.DesiSgw,
    ]);
  });

  it('derives TIER_FETCHED_POINT_SOURCES as every non-synthetic row in enum order', () => {
    // The boot-time slot-load loop + the tier-change reload loop both
    // iterate this list.  Adding a new galaxy catalog via one registry row
    // should automatically wire it through both loops.
    expect([...TIER_FETCHED_POINT_SOURCES]).toEqual([
      Source.SDSS,
      Source.TwoMRS,
      Source.Glade,
      Source.FamousGalaxy,
      Source.Milliquas,
      Source.DesiDeep,
      Source.DesiWedge,
      Source.DesiSgw,
    ]);
  });
});

describe('wireGalaxyCatalogSourceSlot', () => {
  function makeDeps(cb: Partial<EngineCallbacks> = {}): WirePointSourceDeps {
    // commit() now dispatches catalogLoaded via cb.store.dispatch; supply a no-op
    // store so the slot-plumbing tests don't have to care about the descriptor.
    return { cb: { store: { dispatch: vi.fn() }, ...cb } as unknown as EngineCallbacks };
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

  it('dispatches engineSourceCountReported(source, count) on the ready transition', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    // The registry dispatches `engineSourceCountReported` on the ready transition.
    const deps = makeDeps();
    // Use a stub fetcher so we control when the slot transitions to ready.
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => fakeCloud(42),
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, deps);

    const slot = state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    // Drive microtasks so the slot's fetch + commit chain settles.
    // The slot's commit awaits the renderer upload; once that resolves
    // the state transitions to 'ready' and the subscriber dispatches.
    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    const dispatch = deps.cb.store.dispatch as ReturnType<typeof vi.fn>;
    expect(dispatch).toHaveBeenCalledWith(
      engineSourceCountReported({ source: Source.SDSS, count: 42 }),
    );
    // The render wake is covered generically by installSlotReadyWake.test.ts.
  });

  it('commit uploads the cloud to the renderer and writes it into state.sources.catalogs', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const cloud = fakeCloud(7);
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.Glade,
      shortName: 'glade',
      fetcher: async () => cloud,
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());

    const slot = state.assetSlots.points.get(Source.Glade)!;
    slot.load({ source: Source.Glade, tier: 'small' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    // Upload was called with (id, cloud) — the renderer's contract.
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(SOURCE_REGISTRY[Source.Glade].id, cloud);
    // sources.catalogs was populated post-upload.
    expect(state.data.galaxies.catalogs.get(Source.Glade)).toBe(cloud);
  });

  it('skips the upload silently when state.gpu.galaxyPointRenderer is null (post-destroy / pre-init race)', async () => {
    const state = makeState({ rendererUpload: vi.fn() });
    // Simulate the renderer having been torn down before commit fires.
    (state.gpu as unknown as { galaxyPointRenderer: null }).galaxyPointRenderer = null;

    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.TwoMRS,
      shortName: '2mrs',
      fetcher: async () => fakeCloud(3),
      category: 'survey',
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
    expect(state.data.galaxies.catalogs.has(Source.TwoMRS)).toBe(false);
  });
});
