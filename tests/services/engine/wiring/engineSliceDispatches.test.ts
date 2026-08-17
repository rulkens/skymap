/**
 * engineSliceDispatches — verifies that every engine wiring site dispatches
 * the matching engineSlice action to the store alongside its existing callback.
 *
 * Tests are modelled on the `vi.spyOn(store, 'dispatch')` pattern from
 * `catalogLoadedDispatch.test.ts`: spin up a real Redux store, spy on
 * `dispatch`, drive the wiring function, assert the matching action creator
 * was called.
 *
 * Sites covered:
 *   - `wireGalaxyCatalogSourceSlot` → `engineSourceCountReported`
 *   - `wireStructureProjection`     → `engineStructureCountsChanged`
 *   - `installLoadProgress`         → `engineLoadProgressChanged`
 *   - `createSyntheticFallback`     → `engineStatusChanged({ kind:'ready' })`
 *
 * `wireSlots`'s `loading` emission and `engine.ts`'s `initializing`/`error`
 * emissions are integration-level: they are exercised by `wireSlots.test.ts`
 * and `bootstrap.test.ts` respectively.  Adding lightweight assertions here
 * for wireSlots would require mounting the full GPU bootstrap; the loading
 * dispatch is thin-enough to trust from a code review.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStore } from '../../../../src/store/createAppStore';
import {
  engineSourceCountReported,
  engineStructureCountsChanged,
  engineLoadProgressChanged,
  engineStatusChanged,
} from '../../../../src/state/engine/engineSlice';
import { Source } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyCatalogSourceConfig } from '../../../../src/@types/engine/wiring/GalaxyCatalogSourceConfig';
import type { WirePointSourceDeps } from '../../../../src/@types/engine/wiring/WirePointSourceDeps';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { LoadProgressState } from '../../../../src/@types/loading/LoadProgressState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { StructureCatalogPayload } from '../../../../src/@types/loading/StructureCatalogPayload';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { GALAXY_CATALOG_POINT_SOURCES } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';

// ── Module mocks needed for wiring helpers ──────────────────────────────────

// syncVisibilityFadeItem is called from the slot commit body — mock it so
// these dispatch tests don't need a seeded FadeRegistry.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades: vi.fn(),
  syncVisibilityFadeItem: vi.fn(),
}));

// buildStaticAnchorStructures + structureCatalogToStructures: deterministic
// minimal lists for wireStructureProjection tests.
vi.mock('../../../../src/data/structure/buildStaticAnchorStructures', () => ({
  buildStaticAnchorStructures: vi.fn(() => [
    {
      id: 'cluster-virgo',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0.016],
      physicalRadiusMpc: 2.2,
      featured: true,
    },
    {
      id: 'group-local-group',
      name: 'Local Group',
      category: 'group',
      worldPos: [0, 0, 0],
      physicalRadiusMpc: 0.16,
      apparentRadiusMpc: 0.94,
      featured: true,
    },
  ]),
}));

vi.mock('../../../../src/services/engine/wiring/structureCatalogToStructures', () => ({
  structureCatalogToStructures: vi.fn((payload: StructureCatalogPayload) =>
    payload.meta.map((m) => ({
      id: `cluster-bulk-${m.id}`,
      name: m.names[0],
      category: 'cluster',
      worldPos: [0, 0, 0],
      physicalRadiusMpc: 2,
      featured: false,
    })),
  ),
}));

// loadProgressAggregator: capture the emit callback so we can fire it
// manually in the installLoadProgress tests.
let capturedProgressEmitFn: ((snapshot: unknown) => void) | null = null;
const attachSlotSpy = vi.fn();
vi.mock('../../../../src/services/engine/subsystems/loadProgressAggregator', () => ({
  createLoadProgressEmitter: vi.fn((emit: (snapshot: unknown) => void) => {
    capturedProgressEmitFn = emit;
    return { attachSlot: attachSlotSpy, destroy: vi.fn() };
  }),
}));

// ── Post-mock imports ───────────────────────────────────────────────────────

import { wireGalaxyCatalogSourceSlot } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import { wireStructureProjection } from '../../../../src/services/engine/wiring/wireStructureProjection';
import { installLoadProgress } from '../../../../src/services/engine/wiring/installLoadProgress';
import { createSyntheticFallback } from '../../../../src/services/engine/wiring/createSyntheticFallback';

// ── Shared helpers ──────────────────────────────────────────────────────────

function makeGalaxyState(opts: { rendererUpload: ReturnType<typeof vi.fn> }): EngineState {
  return {
    gpu: {
      galaxyPointRenderer: {
        upload: opts.rendererUpload,
        loadedSources: () => [],
        totalCount: () => 0,
      },
    },
    data: createEngineData(),
    subsystems: {
      fades: {
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
    assetSlots: { points: new Map() },
  } as unknown as EngineState;
}

function makeStructureState(): {
  state: EngineState;
  fireSlot: (s: LoadState<StructureCatalogPayload>) => void;
} {
  const listeners = new Set<(s: LoadState<StructureCatalogPayload>) => void>();
  const state = {
    data: createEngineData(),
    assetSlots: {
      structureCatalog: {
        name: 'structure-catalog',
        subscribe: (fn: (s: LoadState<StructureCatalogPayload>) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        load: vi.fn(),
        state: () => ({ kind: 'idle' }),
        current: () => null,
        lastRequest: () => null,
        startedAtMs: () => null,
        forceReload: vi.fn(),
        cancel: vi.fn(),
        release: vi.fn(),
      },
    },
  } as unknown as EngineState;
  return {
    state,
    fireSlot: (s) => {
      for (const fn of listeners) fn(s);
    },
  };
}

function makeProgressState(): EngineState {
  const stubSlot = (name: string): AssetSlot<unknown, unknown> => ({
    name,
    load: vi.fn(),
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  });
  return {
    assetSlots: {
      points: new Map<SourceType, AssetSlot<unknown, unknown>>([
        [Source.SDSS, stubSlot('sdss-points')],
      ]),
      // Real (empty) map: installLoadProgress walks it like points.
      starCatalogs: new Map<SourceType, AssetSlot<unknown, unknown>>(),
      filaments: stubSlot('filaments'),
      famousGalaxiesMeta: stubSlot('famous-galaxies-meta'),
      structureCatalog: stubSlot('structure-catalog'),
      pgcAlias: stubSlot('pgc-aliases'),
      cf4Density: stubSlot('cf4Density'),
      mcpm: stubSlot('mcpm'),
      flow: stubSlot('flow'),
      // Empty keyed family: installLoadProgress walks it like points.
      bodyTextures: new Map(),
    },
    subsystems: { loadProgress: null },
  } as unknown as EngineState;
}

function makeSyntheticFallbackState(): {
  state: EngineState;
  slots: Map<
    SourceType,
    { emit: (s: LoadState<GalaxyCatalog>) => void; load: ReturnType<typeof vi.fn> }
  >;
} {
  const disabled = new Set<SourceType>();
  const items: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const src of [
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    Source.Milliquas,
    Source.FamousGalaxy,
    Source.DesiDeep,
    Source.DesiWedge,
    Source.DesiSgw,
  ]) {
    items[galaxyCatalogIdOf(src)] = { enabled: !disabled.has(src), labelEnabled: true };
  }

  type SlotStub = {
    emit: (s: LoadState<GalaxyCatalog>) => void;
    load: ReturnType<typeof vi.fn>;
  };
  const slots = new Map<SourceType, SlotStub>();
  const assetSlotPoints = new Map<SourceType, AssetSlot<GalaxyCatalog, unknown>>();

  for (const src of [
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    Source.Milliquas,
    Source.FamousGalaxy,
    Source.DesiDeep,
    Source.DesiWedge,
    Source.DesiSgw,
    Source.Synthetic,
  ]) {
    const listeners = new Set<(s: LoadState<GalaxyCatalog>) => void>();
    const load = vi.fn();
    const stub: SlotStub = {
      emit: (s) => {
        for (const fn of [...listeners]) fn(s);
      },
      load,
    };
    slots.set(src, stub);
    assetSlotPoints.set(src, {
      name: `${src}-points`,
      load: load as unknown as AssetSlot<GalaxyCatalog, unknown>['load'],
      current: () => null,
      state: () => ({ kind: 'idle' }),
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      lastRequest: () => null,
      startedAtMs: () => null,
      forceReload: () => {},
      cancel: () => {},
      release: () => {},
    });
  }

  const state = {
    tier: 'medium',
    settings: { galaxyCatalogs: { items } } as never,
    requests: new Set<string>(),
    gpu: { galaxyPointRenderer: { totalCount: () => 99 } },
    assetSlots: { points: assetSlotPoints, bodyTextures: new Map() },
    // `createSyntheticFallback` calls `reevaluateDemand`, which enqueues onto
    // this rather than calling `slot.load()` directly.
    subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
    // Far from Earth — buildDemandCtx assembles the eye from pose + projection,
    // so both must be present; a far resting pose keeps the proximity-gated
    // body-texture rows out of the demand set.
    cameraRuntime: {
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity } },
      projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
      lastRenderedSimDays: { current: CONST_J2000 },
    },
  } as unknown as EngineState;

  return { state, slots };
}

// ── wireGalaxyCatalogSourceSlot: engineSourceCountReported ─────────────────

describe('wireGalaxyCatalogSourceSlot → engineSourceCountReported', () => {
  it('dispatches engineSourceCountReported({ source, count }) when the slot reaches ready', async () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');

    const state = makeGalaxyState({ rendererUpload: vi.fn().mockResolvedValue(undefined) });
    const cfg: GalaxyCatalogSourceConfig = {
      source: Source.SDSS,
      shortName: 'sdss',
      fetcher: async () => ({ count: 42 }) as GalaxyCatalog,
      category: 'survey',
    };
    const deps: WirePointSourceDeps = {
      cb: { store, sources: {} } as unknown as EngineCallbacks,
    };

    wireGalaxyCatalogSourceSlot(state, cfg, deps);
    const slot = state.assetSlots.points.get(Source.SDSS)!;
    slot.load({ source: Source.SDSS, tier: 'medium' });

    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(spy).toHaveBeenCalledWith(engineSourceCountReported({ source: Source.SDSS, count: 42 }));
  });
});

// ── wireStructureProjection: engineStructureCountsChanged ──────────────────

describe('wireStructureProjection → engineStructureCountsChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches engineStructureCountsChanged with four-category counts at boot', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const { state } = makeStructureState();
    const cb = { store, sources: {} } as unknown as EngineCallbacks;

    wireStructureProjection(state, cb);

    expect(spy).toHaveBeenCalledWith(
      engineStructureCountsChanged(
        expect.objectContaining({
          cluster: expect.any(Number),
          supercluster: expect.any(Number),
          void: expect.any(Number),
          group: expect.any(Number),
        }),
      ),
    );
  });

  it('dispatches engineStructureCountsChanged again when the bulk slot fires', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const { state, fireSlot } = makeStructureState();
    const cb = { store, sources: {} } as unknown as EngineCallbacks;

    wireStructureProjection(state, cb);
    spy.mockClear();

    const payload: StructureCatalogPayload = {
      catalog: {
        count: 1,
        positions: new Float32Array([1, 2, 3]),
        physicalRadiusMpc: new Float32Array([2]),
        apparentRadiusMpc: new Float32Array([4]),
        significance: new Float32Array([0.9]),
        category: new Uint8Array([0]),
      },
      meta: [{ id: 'coma', names: ['Coma Cluster'], abell: 'A1656', description: '' }],
    };
    fireSlot({ kind: 'ready', req: {}, value: payload, loadedAtMs: 0 });

    expect(spy).toHaveBeenCalledWith(
      engineStructureCountsChanged(expect.objectContaining({ cluster: expect.any(Number) })),
    );
  });
});

// ── installLoadProgress: engineLoadProgressChanged ─────────────────────────

describe('installLoadProgress → engineLoadProgressChanged', () => {
  beforeEach(() => {
    capturedProgressEmitFn = null;
    attachSlotSpy.mockClear();
  });

  it('dispatches engineLoadProgressChanged(snapshot) when the emitter fires', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeProgressState();
    const deps: BootstrapDeps = {
      canvas: {} as HTMLCanvasElement,
      cb: { store } as unknown as BootstrapDeps['cb'],
      frameRef: { current: () => {} },
      detachControlsRef: { current: null },
      handleRef: { current: null },
      allSlots: new Map(),
    };

    installLoadProgress(state, deps);

    // The mock captured the emit callback — fire it with a real snapshot.
    const snapshot: LoadProgressState = { loadedBytes: 50, totalBytes: 100, inFlightCount: 2 };
    capturedProgressEmitFn!(snapshot);

    expect(spy).toHaveBeenCalledWith(engineLoadProgressChanged(snapshot));
  });

  it('dispatches engineLoadProgressChanged(null) when the emitter fires with null', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeProgressState();
    const deps: BootstrapDeps = {
      canvas: {} as HTMLCanvasElement,
      cb: { store } as unknown as BootstrapDeps['cb'],
      frameRef: { current: () => {} },
      detachControlsRef: { current: null },
      handleRef: { current: null },
      allSlots: new Map(),
    };

    installLoadProgress(state, deps);
    capturedProgressEmitFn!(null);

    expect(spy).toHaveBeenCalledWith(engineLoadProgressChanged(null));
  });
});

// ── createSyntheticFallback: engineStatusChanged (ready) ───────────────────

describe('createSyntheticFallback → engineStatusChanged({ kind: "ready" })', () => {
  it('dispatches engineStatusChanged ready when a real galaxy catalog slot fires ready with count > 0', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const { state, slots } = makeSyntheticFallbackState();
    const cb = { store } as unknown as EngineCallbacks;

    createSyntheticFallback(state, cb);

    slots.get(Source.Glade)?.emit({
      kind: 'ready',
      req: {},
      value: { count: 7 } as GalaxyCatalog,
      loadedAtMs: 0,
    });

    expect(spy).toHaveBeenCalledWith(
      engineStatusChanged({ kind: 'ready', count: 99, source: Source.Glade }),
    );
  });

  it('does not dispatch ready when a slot fires ready with count === 0', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const { state, slots } = makeSyntheticFallbackState();
    const cb = { store } as unknown as EngineCallbacks;

    createSyntheticFallback(state, cb);

    slots
      .get(Source.SDSS)
      ?.emit({ kind: 'ready', req: {}, value: { count: 0 } as GalaxyCatalog, loadedAtMs: 0 });

    // count=0 must NOT trigger a ready dispatch (the gate treats it as no data).
    const readyDispatches = spy.mock.calls.filter((call) => {
      const action = call[0] as { payload?: { kind?: string } };
      return action?.payload?.kind === 'ready';
    });
    expect(readyDispatches).toHaveLength(0);
  });

  it('dispatches engineStatusChanged ready for the synthetic slot when it fires', () => {
    const { store } = createAppStore();
    const spy = vi.spyOn(store, 'dispatch');
    const { state, slots } = makeSyntheticFallbackState();
    const cb = { store } as unknown as EngineCallbacks;

    createSyntheticFallback(state, cb);

    // Arm the fallback: all real galaxy catalogs error out.
    for (const src of GALAXY_CATALOG_POINT_SOURCES) {
      slots.get(src)?.emit({ kind: 'error', req: {}, error: new Error('fail'), finalAttempt: 1 });
    }

    spy.mockClear();

    // Synthetic slot fires ready.
    slots.get(Source.Synthetic)?.emit({
      kind: 'ready',
      req: {},
      value: { count: 5 } as GalaxyCatalog,
      loadedAtMs: 0,
    });

    expect(spy).toHaveBeenCalledWith(
      engineStatusChanged({ kind: 'ready', count: 99, source: Source.Synthetic }),
    );
  });
});
