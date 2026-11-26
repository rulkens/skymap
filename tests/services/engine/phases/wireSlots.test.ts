/**
 * wireSlots — the demand-driven asset orchestrator phase. `bootstrap.test.ts` mocks it at module
 * scope, so this file pins: (1) returns synchronously and fires one `loading` status; (2) the demand
 * loop loads the default boot set and real-catalog `ready` echoes fire; (3) the loadProgress emitter
 * is wired against EVERY slot in `deps.allSlots`; (4) every subsystem/fade wire is present,
 * including structures-visibility gating of structureCatalog.
 *
 * `AssetSlot`s are real; fetchers and the GPU device are mocked. The Layer's point slots are
 * pre-seeded fakes (`createLayers` composes the real ones and never runs here).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSources';
import { createAppStore } from '../../../../src/store/createAppStore';
import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import { makeGalaxyCatalogItems } from '../../../fixtures/makeGalaxyCatalogItems';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { engineStatusChanged } from '../../../../src/state/engine/engineSlice';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceId } from '../../../../src/@types/data/SourceId';

// Every fetcher is a no-op resolved Promise: slots whose `.load()` fires inside wireSlots
// (the structure catalog, the density cubes) just need to reach `ready`. The per-source point
// slots, the only ones with a commit step, are injected as fakes.

// The structure-catalog slot fires `.load({})` at boot; mock its fetcher so
// the test doesn't network.  An empty catalog is enough: only whether it
// fetched is asserted here.
vi.mock('../../../../src/layers/structure/catalog/load/structureCatalogFetcher', () => ({
  structureCatalogFetcher: vi.fn(async () => ({
    catalog: {
      count: 0,
      positions: new Float32Array(0),
      physicalRadiusMpc: new Float32Array(0),
      apparentRadiusMpc: new Float32Array(0),
      significance: new Float32Array(0),
      category: new Uint8Array(0),
    },
    meta: [],
  })),
}));

// wireSlots awaits loadDataManifest() before reevaluateDemand. Default resolves immediately; the
// deferred-manifest test overrides it once with mockReturnValueOnce.
vi.mock('../../../../src/services/loading/dataManifest', () => ({
  loadDataManifest: vi.fn(async () => {}),
}));

// Load-progress emitter: keep the real factory (so the slot registry
// gets walked) but spy on it so we can assert the Map size at the
// moment wireSlots hands the registry off.
const emitterSpy = vi.fn();
vi.mock('../../../../src/services/engine/subsystems/loadProgressAggregator', () => ({
  createLoadProgressEmitter: vi.fn((_emit: unknown, slots: ReadonlyMap<string, unknown>) => {
    emitterSpy(slots);
    return {
      emit: vi.fn(),
      attachSlot: vi.fn(),
    };
  }),
}));

import { wireSlots } from '../../../../src/services/engine/phases/wireSlots';
import { meshAssetRow } from '../../../../src/services/engine/wiring/meshAssetRow';
import { MESH_PRESENTATIONS } from '../../../../src/data/bodies/meshPresentations';
import { galaxyCatalogAssetRows } from '../../../../src/layers/galaxyCatalog/records/load/galaxyCatalogAssetRows';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { structureCatalogFetcher } from '../../../../src/layers/structure/catalog/load/structureCatalogFetcher';
import { createStructureCatalogSlot } from '../../../../src/layers/structure/catalog/load/structureCatalogSlot';
import { structureAssetRows } from '../../../../src/layers/structure/catalog/load/structureAssetRows';
import { createCosmicWebDensitySlot } from '../../../../src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot';
import { cosmicWebDensityAssetRows } from '../../../../src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import { loadDataManifest } from '../../../../src/services/loading/dataManifest';
import { absoluteArm } from '../../../../src/utils/camera/arms/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';

/** A fake `AssetSlot` whose lifecycle the test drives: `fire(state)` notifies every subscriber
 *  synchronously. wireSlots only consumes `subscribe` (all-arrivals gate) and `load`, so no fuller
 *  state machine is modelled. */
type FakeSlot = AssetSlot<unknown, unknown> & {
  fire: (s: LoadState<unknown>) => void;
};

function makeFakeSlot(name: string): FakeSlot {
  const subs = new Set<(s: LoadState<unknown>) => void>();
  let current: LoadState<unknown> = { kind: 'idle' };
  const slot: FakeSlot = {
    name,
    load: vi.fn(),
    current: () => null,
    committed: () => null,
    state: () => current,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
    fire(s) {
      current = s;
      // Subs may unsubscribe themselves during dispatch — iterate a copy.
      for (const fn of Array.from(subs)) fn(s);
    },
  };
  return slot;
}

/**
 * Build a boot-shaped points map: SDSS/2MRS/GLADE galaxy catalog fakes left idle
 * (still "loading" — they never fire), plus a Famous fake pre-fired to
 * `loading` so the famous-galaxies-meta demand predicate (`slotState(Famous) !== 'idle'`)
 * reads true.  Idle galaxy catalog fakes never re-run demand — the live-boot shape.
 */
function bootPointSlots(): Map<SourceId, ReturnType<typeof makeFakeSlot>> {
  const famous = makeFakeSlot('famous-points');
  famous.fire({ kind: 'loading', req: {}, attempt: 1 } as never);
  return new Map<SourceId, ReturnType<typeof makeFakeSlot>>([
    ['sdss', makeFakeSlot('sdss-points')],
    ['2mrs', makeFakeSlot('2mrs-points')],
    ['glade', makeFakeSlot('glade-points')],
    ['famousGalaxy', famous],
  ]);
}

/** A `ready` payload shaped enough for the all-arrivals gate's `count > 0` check. */
const readyValue = (count: number): LoadState<unknown> => ({
  kind: 'ready',
  req: {},
  value: { count },
  loadedAtMs: 0,
});

/** A post-`createLayers` `EngineState` over a hand-picked subset of asset rows (the mesh rows, the
 *  galaxy catalog on fake slots, the density cubes, the structure catalog) and the REAL settings
 *  root and visibility registry, so a new Layer, slot or setting needs no edit here. */
function makeState(
  overrides: Partial<{
    points: Map<SourceId, ReturnType<typeof makeFakeSlot>>;
    markerCategoryVisibility: Record<string, boolean>;
    labelCategoryVisibility: Record<string, boolean>;
  }> = {},
): EngineState {
  // Every point row carries a slot, as its Layer's `create` mints; the ones a
  // test does not pass stay idle.
  const points = new Map(overrides.points);
  for (const code of GALAXY_CATALOG_SOURCES) {
    if (!points.has(code)) points.set(code, makeFakeSlot(`points-${code}`));
  }
  const galaxyRuntime = {
    points,
    famousGalaxiesMeta: makeFakeSlot('famous-galaxies-meta'),
    pgcAlias: makeFakeSlot('pgc-aliases'),
    hiResFamous: makeFakeSlot('hi-res-famous'),
  } as unknown as GalaxyCatalogRuntime;
  const densityRenderer = { upload: vi.fn() } as never;
  const densityRuntime = {
    renderer: densityRenderer,
    jitterMaskSlot: makeFakeSlot('jitter-mask'),
    slots: Object.fromEntries(
      COSMIC_WEB_DENSITY_SOURCE_ROWS.map((entry) => [
        entry.id,
        // MCPM is default-on, so the demand loop fires its load at boot; no networking.
        createCosmicWebDensitySlot(entry, {
          renderer: densityRenderer,
          fetch: async () =>
            ({
              texture: { destroy: vi.fn() },
              gain: 1,
              nativeBox: { offset: [0, 0, 0], scale: [1, 1, 1] },
            }) as never,
        }),
      ]),
    ),
  } as unknown as CosmicWebDensityRuntime;
  const structureRuntime = { slot: createStructureCatalogSlot() };
  const allVisible: Record<string, boolean> = {
    'galaxy-cluster': true,
    supercluster: true,
    void: true,
    famousGalaxy: true,
    'galaxy-group': true,
  };
  // Translate the per-axis override maps into the per-category item rows the
  // structureCatalog demand predicate reads (ring axis = `enabled`, label axis
  // = `labelEnabled`). Defaults all-visible ⇒ structureCatalog demanded.
  const markerVis = overrides.markerCategoryVisibility ?? allVisible;
  const labelVis = overrides.labelCategoryVisibility ?? allVisible;
  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const cat of STRUCTURE_IDS) {
    structureItems[cat] = { enabled: markerVis[cat] ?? true, labelEnabled: labelVis[cat] ?? true };
  }
  const state = {
    tier: 'medium',
    ui: { paletteOpen: false },
    // The real settings root, so every demand predicate and fade seed resolves
    // whatever Layers exist; the two deviations are what the cases below turn on.
    settings: {
      ...INITIAL_SETTINGS,
      // Every catalog on (boot leaves desiDeep off): demand reads these `enabled`
      // bits, so each catalog a case provides a slot for is demanded.
      galaxyCatalogs: { ...INITIAL_SETTINGS.galaxyCatalogs, items: makeGalaxyCatalogItems() },
      // Overridable so a case can hide the categories and pin the bug-fix
      // (structureCatalog must NOT load when nothing structural is visible).
      structures: { enabled: true, items: structureItems },
    },
    // Read at commit time by the mesh rows' slots; no mesh loads from this pose.
    gpu: {},
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      // `wireSlots` ends with `reevaluateDemand`, which enqueues onto this
      // rather than calling `slot.load()` directly.
      assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),
      fades: { register: vi.fn(), fadeTo: vi.fn(), targetOf: vi.fn(() => null) },
    },
    // Far from Earth — buildDemandCtx assembles the eye from pose + projection,
    // so both must be present; a far resting pose keeps the proximity-gated
    // body-texture rows out of the demand set (boot-load expectations stay
    // sdss/2mrs/glade/…, no Blue Marble fetch).
    terrainHeightAt: datumOnlyTerrainHeight,
    cameraRuntime: {
      register: {
        pose: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
      },
      outputs: {
        displayed: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
        simDays: CONST_J2000,
        upBasis: ORIENTATION_FRAMES.ecliptic,
      },
    },
    visibilityEntries: APP_VISIBILITY_REGISTRY,
    selection: { hover: null, select: null, focus: null, pending: { select: null, focus: null } },
  } as unknown as EngineState;
  state.assetRows = expandCompanionRows([
    ...MESH_PRESENTATIONS.map((p) => meshAssetRow({ setMesh: () => {}, clearMesh: () => {} }, p)),
    ...galaxyCatalogAssetRows(galaxyRuntime),
    ...cosmicWebDensityAssetRows(densityRuntime),
    ...structureAssetRows(structureRuntime),
  ]);
  state.slotsByKey = new Map(state.assetRows.map((row) => [row.key, row.slot]));
  return state;
}

/** Only what the phase reads: the store it dispatches to and the registry it fills. */
function makeDeps(): BootstrapDeps {
  return {
    cb: { store: createAppStore().store },
    allSlots: new Map(),
  } as unknown as BootstrapDeps;
}

describe('wireSlots', () => {
  beforeEach(() => {
    emitterSpy.mockClear();
  });

  it('returns synchronously (does not await any slot) and fires `loading` status', async () => {
    // Progressive disclosure: wireSlots kicks off loads then returns.
    // Per-arrival `ready` emissions happen later via the subscribers it
    // registered, not by awaiting in this body.
    const sdssSlot = makeFakeSlot('sdss-points');
    const twoMrsSlot = makeFakeSlot('2mrs-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const famousSlot = makeFakeSlot('famous-points');
    const points = new Map<SourceId, ReturnType<typeof makeFakeSlot>>([
      ['sdss', sdssSlot],
      ['2mrs', twoMrsSlot],
      ['glade', gladeSlot],
      ['famousGalaxy', famousSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();
    const dispatchSpy = vi.spyOn(deps.cb.store, 'dispatch');

    await wireSlots(state, deps);

    expect(dispatchSpy).toHaveBeenCalledWith(engineStatusChanged({ kind: 'loading' }));
    // The boot demand pass ENQUEUES rather than loading, and the queue starts
    // only `ASSET_QUEUE_CONCURRENCY` of them before returning. Drain so every
    // demanded row actually reaches its slot — the question here is which rows
    // were demanded, not how many the queue runs at once.
    await state.subsystems.assetQueue.drain();
    expect(sdssSlot.load).toHaveBeenCalled();
    expect(twoMrsSlot.load).toHaveBeenCalled();
    expect(gladeSlot.load).toHaveBeenCalled();
    expect(famousSlot.load).toHaveBeenCalled();

    const loadingDispatches = dispatchSpy.mock.calls.filter((c) => {
      const action = c[0] as ReturnType<typeof engineStatusChanged>;
      return action.type === engineStatusChanged.type && action.payload.kind === 'loading';
    });
    expect(loadingDispatches.length).toBe(1);
  });

  it('starts no load until the data manifest has resolved', async () => {
    // Same point-slot setup as the test above. Also pins a sidecar fetcher from the default boot set
    // (structureCatalog) so a refactor that split sidecar dispatch onto a second, differently-awaited path
    // fails here. Famous-galaxies-meta is left out: its predicate reads Famous's slot state, and pre-firing
    // it would collide with the point-slot assertions.
    let resolveManifest!: () => void;
    const deferred = new Promise<void>((resolve) => {
      resolveManifest = resolve;
    });
    vi.mocked(loadDataManifest).mockReturnValueOnce(deferred);
    vi.mocked(structureCatalogFetcher).mockClear();

    const sdssSlot = makeFakeSlot('sdss-points');
    const twoMrsSlot = makeFakeSlot('2mrs-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const famousSlot = makeFakeSlot('famous-points');
    const points = new Map<SourceId, ReturnType<typeof makeFakeSlot>>([
      ['sdss', sdssSlot],
      ['2mrs', twoMrsSlot],
      ['glade', gladeSlot],
      ['famousGalaxy', famousSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    const pending = wireSlots(state, deps);
    // Flush pending microtasks without resolving the manifest deferred —
    // reevaluateDemand sits behind the await, so nothing should fire yet.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sdssSlot.load).not.toHaveBeenCalled();
    expect(twoMrsSlot.load).not.toHaveBeenCalled();
    expect(gladeSlot.load).not.toHaveBeenCalled();
    expect(famousSlot.load).not.toHaveBeenCalled();
    expect(structureCatalogFetcher).not.toHaveBeenCalled();

    resolveManifest();
    await pending;
    await state.subsystems.assetQueue.drain();

    expect(sdssSlot.load).toHaveBeenCalled();
    expect(twoMrsSlot.load).toHaveBeenCalled();
    expect(gladeSlot.load).toHaveBeenCalled();
    expect(famousSlot.load).toHaveBeenCalled();
    expect(structureCatalogFetcher).toHaveBeenCalled();
  });

  it('demand loop loads the default boot sidecar set (structureCatalog + famousGalaxiesMeta) and not the off-by-default ones', async () => {
    // Boot parity: the cluster catalog (structures visible) and famous-galaxies-meta load at boot;
    // filaments (off) and the lazy PGC alias stay idle. Each sidecar is observed through its (mocked)
    // fetcher, cleared first because module-scoped mocks persist across tests. (mcpm-boots /
    // polyphorm-2mrs-idle coverage lives in demandTable.test and cosmicWebDensityAssetRows.test.)
    vi.mocked(structureCatalogFetcher).mockClear();

    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();

    await wireSlots(state, deps);
    await state.subsystems.assetQueue.drain();

    // Default-on / structures-visible => fetched; the famous-meta sidecar is the Layer's slot, observed on the stub.
    expect(structureCatalogFetcher).toHaveBeenCalled();
    expect(state.slotsByKey.get('famousGalaxiesMeta')!.load).toHaveBeenCalled();
    expect(state.slotsByKey.get('pgcAlias')!.load).not.toHaveBeenCalled();
  });

  it('does not load structureCatalog when every structure category is hidden (bug-fix integration pin)', async () => {
    // demandTable.test.ts pins the cluster predicate in isolation; this pins that wireSlots threads the
    // visibility records THROUGH to the demand loop: with marker and label visibility all-false,
    // structureCatalog must be skipped.
    vi.mocked(structureCatalogFetcher).mockClear();

    const allHidden = {
      'galaxy-cluster': false,
      supercluster: false,
      void: false,
      famousGalaxy: false,
    };
    const state = makeState({
      points: bootPointSlots(),
      markerCategoryVisibility: allHidden,
      labelCategoryVisibility: allHidden,
    });
    const deps = makeDeps();

    await wireSlots(state, deps);

    expect(structureCatalogFetcher).not.toHaveBeenCalled();
  });

  // Seeded before any slot can commit (gates collected after seeding would seed it at 1):
  // a gated identity waits at 0 and its slot's commit is what raises it.
  it('a gated visibility identity seeds at 0 and its slot commit raises it', async () => {
    const sdssSlot = makeFakeSlot('sdss-points');
    const state = makeState({ points: new Map([['sdss', sdssSlot]]) });
    const fades = state.subsystems.fades;

    await wireSlots(state, makeDeps());

    expect(fades.register).toHaveBeenCalledWith({ address: 'survey', item: 'sdss' }, 0);
    sdssSlot.committed = () => readyValue(1) as never;
    sdssSlot.fire(readyValue(1));
    expect(fades.fadeTo).toHaveBeenCalledWith(
      { address: 'survey', item: 'sdss' },
      1,
      expect.any(Number),
    );
  });

  it('loadProgress emitter is constructed with a slot registry that includes every minted slot name', async () => {
    // `allSlots` is both the load-progress emitter's input and the dev panel's registry; dropping a slot
    // from it would make the loading bar and dev panel silently disagree. Pins the post-mint contents.
    const sdssSlot = makeFakeSlot('sdss-points');
    const twoMrsSlot = makeFakeSlot('2mrs-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const famousSlot = makeFakeSlot('famous-points');
    const points = new Map<SourceId, ReturnType<typeof makeFakeSlot>>([
      ['sdss', sdssSlot],
      ['2mrs', twoMrsSlot],
      ['glade', gladeSlot],
      ['famousGalaxy', famousSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    await wireSlots(state, deps);

    // The emitter is constructed once, with the same Map instance as `deps.allSlots` (the loading bar
    // and dev panel must share it).
    expect(emitterSpy).toHaveBeenCalledTimes(1);
    const capturedRegistry = emitterSpy.mock.calls[0]![0] as Map<string, unknown>;
    expect(capturedRegistry).toBe(deps.allSlots);

    // Asserted as a superset so additive changes don't break the test for the wrong reason: the Layer's
    // slots, the structure Layer's catalog slot, and the mesh Layers' mesh slots.
    const names = new Set(capturedRegistry.keys());
    expect(names.has('sdss-points')).toBe(true);
    expect(names.has('2mrs-points')).toBe(true);
    expect(names.has('glade-points')).toBe(true);
    expect(names.has('famous-points')).toBe(true);
    expect(names.has('famous-galaxies-meta')).toBe(true);
    expect(names.has('structure-catalog')).toBe(true);
    expect(names.has('pgc-aliases')).toBe(true);
    expect(names.has('curiosity-mesh')).toBe(true);
  });
});
