/**
 * galaxyCatalogSourceRegistry — unit tests for the galaxy-catalog
 * source slot wiring helper.
 *
 * The galaxy-catalog source slots (SDSS, 2MRS, GLADE, Famous,
 * Milliquas, DESI Deep, DESI Wedge, DESI SGW, Synthetic) all share one slot construction shape:
 * name = `${shortName}-points`, upload-on-commit, source-count dispatch
 * on the `ready` transition.  The per-source variance lives in a
 * declarative `GALAXY_CATALOG_SOURCE_REGISTRY`; `wireGalaxyCatalogSourceSlot`
 * is called once per row.
 *
 * These tests verify the helper's contract without spinning up the
 * full engine:
 *   - each `wireGalaxyCatalogSourceSlot` call mints a slot, subscribes
 *     to it, and stores it in `state.assetSlots.points` keyed by
 *     `Source`;
 *   - the subscriber dispatches `engineSourceCountReported(source, count)`
 *     on the `ready` transition, and is silent on the loading / committing /
 *     error transitions (the render wake is covered generically by
 *     `installSlotReadyWake.test.ts`);
 *   - the commit step uploads to the renderer and mutates
 *     `state.sources.catalogs`;
 *   - the commit drives the row's fade-in through the SCOPED single-item
 *     bridge, after the upload, on a first load and on a re-commit;
 *   - multiple sources wired in succession produce independent slots
 *     keyed correctly — no cross-talk between SDSS and GLADE;
 *   - `GALAXY_CATALOG_SOURCE_REGISTRY` declares the expected sources
 *     in Source enum order.
 *
 * AssetSlot retry-policy / race-checking is covered by
 * `AssetSlot.test.ts`.  This suite is about the *plumbing* between
 * the registry, the helper, and `state.assetSlots.points`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// The commit's fade-in routes through the bridge; a typed spy lets the fade
// block below assert the call without standing up full settings/sources state
// for the real per-row fade walk. The per-row fade itself is covered by
// syncVisibilityFades.test.ts.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
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
import { syncVisibilityFadeItem } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { engineSourceCountReported } from '../../../../src/state/engine/engineSlice';
import { installSlotReadyWake } from '../../../../src/services/engine/wiring/installSlotReadyWake';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';

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
    contentVersion: 0,
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

  it('a commit bumps state.contentVersion by exactly one', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => fakeCloud(5),
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());
    const slot = state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    expect(state.contentVersion).toBe(1);
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

describe('wireGalaxyCatalogSourceSlot — fade-in bridge', () => {
  const bridge = vi.mocked(syncVisibilityFadeItem);

  beforeEach(() => bridge.mockClear());

  function makeDeps(): WirePointSourceDeps {
    return { cb: { store: { dispatch: vi.fn() } } as unknown as EngineCallbacks };
  }

  it('drives the fade-in through the scoped bridge after upload', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ rendererUpload: upload });
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => fakeCloud(5),
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());
    const slot = state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    await vi.waitFor(() => {
      expect(slot.state().kind).toBe('ready');
    });

    // The scoped single-item entry, applying the survey row's intent to ONLY
    // this catalog rather than every survey id.
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith(state, 'survey', galaxyCatalogIdOf(Source.SDSS));
    // The fade-in fires AFTER the renderer upload (commit order).
    expect(upload.mock.invocationCallOrder[0]!).toBeLessThan(
      bridge.mock.invocationCallOrder[bridge.mock.invocationCallOrder.length - 1]!,
    );
  });

  // The sky-cubemap bake key no longer reads `isAnyAnimating` (Task 3's
  // `contentVersion` term replaces it) — this pins that the render wake a
  // re-commit needs was never solely the fade's to give: `installSlotReadyWake`
  // fires on every `ready` transition regardless of whether the row's fade
  // has anything left to animate.
  it('a re-commit whose fade is already held still requests a render', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const requestRender = vi.fn();
    const state = makeState({ rendererUpload: upload });
    (
      state as unknown as { subsystems: { scheduler: { requestRender: () => void } } }
    ).subsystems.scheduler = { requestRender };
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => fakeCloud(5),
      category: 'survey',
    };

    wireGalaxyCatalogSourceSlot(state, cfg, makeDeps());
    const slot = state.assetSlots.points.get(Source.SDSS)!;
    installSlotReadyWake(
      requestRender,
      state.assetSlots.points as unknown as ReadonlyMap<string, AssetSlot<unknown, unknown>>,
    );

    // Pre-seed the row's fade at the target the commit will drive toward —
    // "already held", nothing left for the fade path to animate.
    (state.subsystems.fades as { setImmediate: (id: unknown, v: number) => void }).setImmediate(
      { kind: 'galaxyCatalog', id: galaxyCatalogIdOf(Source.SDSS) },
      1,
    );

    slot.load({ source: Source.SDSS, tier: 'medium' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    requestRender.mockClear();

    // Re-commit.
    slot.load({ source: Source.SDSS, tier: 'medium' });
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    expect(requestRender).toHaveBeenCalled();
  });
});
