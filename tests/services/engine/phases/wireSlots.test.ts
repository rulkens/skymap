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
import { GALAXY_CATALOG_SOURCES, Source } from '../../../../src/data/sources';
import { galaxyCatalogVisibility } from '../../../../src/layers/galaxyCatalog/visibility';
import { cosmicWebDensityVisibility } from '../../../../src/layers/cosmicWebDensity/visibility';
import { createAppStore } from '../../../../src/store/createAppStore';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { BODY_SOURCE_IDS } from '../../../../src/data/bodies/bodySourceIds';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/layers/galaxyCatalog/state/defaults';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { engineStatusChanged } from '../../../../src/state/engine/engineSlice';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// Every fetcher is a no-op resolved Promise: slots whose `.load()` fires inside wireSlots
// (famousGalaxiesMeta, filaments, the density cubes) just need to reach `ready`. The per-source point
// slots, the only ones with a commit step, are injected as fakes.

vi.mock('../../../../src/layers/cosmicWebFilaments/load/filamentFetcher', () => ({
  filamentFetcher: vi.fn(async () => ({
    stripCount: 0,
    vertexCount: 0,
    strips: [] as unknown[],
  })),
}));

// famousStarsMeta demands unconditionally at boot, so its fetcher fires inside
// every wireSlots run; mock it so the test doesn't network.
vi.mock('../../../../src/services/loading/fetchers/famousStarsMetaFetcher', () => ({
  famousStarsMetaFetcher: vi.fn(async () => ({ meta: [] })),
}));

// The structure-catalog slot fires `.load({})` at boot; mock its fetcher so
// the test doesn't network.  An empty catalog is enough: only whether it
// fetched is asserted here.
vi.mock('../../../../src/layers/structure/load/structureCatalogFetcher', () => ({
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

// MCPM is default-on, so the demand loop fires its load at boot.  Mock the
// fetcher so the slot resolves without networking.
vi.mock('../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher', () => ({
  cosmicWebDensityFetcher: vi.fn(async () => ({
    dims: [4, 4, 4],
    voxels: new Float32Array(64),
    valueMin: 0,
    valueMax: 1,
    frame: 'supergalactic',
    boundsKpc: { min: [0, 0, 0], max: [1, 1, 1] },
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
import { meshAssetRows } from '../../../../src/services/engine/wiring/meshAssetRows';
import { galaxyCatalogAssetRows } from '../../../../src/layers/galaxyCatalog/load/galaxyCatalogAssetRows';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { structureCatalogFetcher } from '../../../../src/layers/structure/load/structureCatalogFetcher';
import { createStructureCatalogSlot } from '../../../../src/layers/structure/load/structureCatalogSlot';
import { structureAssetRows } from '../../../../src/layers/structure/load/structureAssetRows';
import { createCosmicWebDensitySlot } from '../../../../src/layers/cosmicWebDensity/load/createCosmicWebDensitySlot';
import { cosmicWebDensityAssetRows } from '../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityAssetRows';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import { filamentFetcher } from '../../../../src/layers/cosmicWebFilaments/load/filamentFetcher';
import { loadDataManifest } from '../../../../src/services/loading/dataManifest';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { STUB_COMPOSITION } from '../../../helpers/engine/stubComposition';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';

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
function bootPointSlots(): Map<SourceType, ReturnType<typeof makeFakeSlot>> {
  const famous = makeFakeSlot('famous-points');
  famous.fire({ kind: 'loading', req: {}, attempt: 1 } as never);
  return new Map<SourceType, ReturnType<typeof makeFakeSlot>>([
    [Source.SDSS, makeFakeSlot('sdss-points')],
    [Source.TwoMRS, makeFakeSlot('2mrs-points')],
    [Source.Glade, makeFakeSlot('glade-points')],
    [Source.FamousGalaxy, famous],
  ]);
}

/** A `ready` payload shaped enough for the all-arrivals gate's `count > 0` check. */
const readyValue = (count: number): LoadState<unknown> => ({
  kind: 'ready',
  req: {},
  value: { count },
  loadedAtMs: 0,
});

const errorValue = (msg: string): LoadState<unknown> => ({
  kind: 'error',
  req: {},
  error: new Error(msg),
  finalAttempt: 1,
});

/** Minimal post-`initGpu` `EngineState`: GPU renderers present (commit subscribers don't NPE),
 *  per-source slot map empty (per case), galaxy catalogs all-enabled via `GALAXY_CATALOG_IDS`, which is
 *  deliberately BROADER than the boot seed (default-off desiDeep is left out) so the demand loop demands
 *  every catalog a test provides a slot for. Volume fields match the boot literal so the MCPM
 *  predicate reads true. */
function makeState(
  overrides: Partial<{
    points: Map<SourceType, ReturnType<typeof makeFakeSlot>>;
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
    slots: Object.fromEntries(
      COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => [
        entry.id,
        createCosmicWebDensitySlot(entry, densityRenderer),
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
  // Pull the singleton-overlay + star-catalog clusters from `INITIAL_SETTINGS`
  // so the demand loop's `settings.flow.enabled` /
  // `settings.constellations.enabled` / `settings.starCatalogs.enabled` reads
  // resolve instead of throwing on an undefined slice (which reevaluateDemand
  // would swallow as a per-row warn). Flow + constellations default OFF, so no
  // overlay load fires. starCatalogs is forced OFF here (Gaia boots enabled,
  // so leaving the master gate on would demand a real star-bin fetch this
  // fixture provides no slot for).
  const state = {
    tier: 'medium',
    settings: {
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        provenance: DEFAULT_GALAXY_PROVENANCE,
        // All galaxy catalogs enabled (a uniform test scenario; the real
        // boot literal leaves desiDeep off) — galaxy catalog demand reads
        // these `enabled` bits (not `sources.drawMask`), so the boot-load
        // expectations for sdss/2mrs/glade hang off this seed.
        items: Object.fromEntries(
          GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
        ),
      },
      tonemap: { exposure: 1.0, curve: 'reinhard' },
      bias: { mode: 'off', absMagLimit: -18 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true, labelEnabled: true },
      zoneOfAvoidance: INITIAL_SETTINGS.zoneOfAvoidance,
      cosmicWebFilaments: { enabled: false, intensity: 1.0 },
      orbitTrails: { enabled: true },
      missionTrails: { enabled: false },
      sStarTrails: { enabled: true },
      cosmicWebDensity: {
        enabled: true,
        items: {
          mcpm: { enabled: true },
          'polyphorm-2mrs': { enabled: false },
          'mcpm-workbench': { enabled: false },
        },
      },
      bodies: {
        items: Object.fromEntries(
          BODY_SOURCE_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
        ),
      },
      // Overridable so a test can hide every category and pin the bug-fix
      // (structureCatalog must NOT load when nothing structural is visible).
      structures: { enabled: true, items: structureItems },
      flow: INITIAL_SETTINGS.flow,
      constellations: INITIAL_SETTINGS.constellations,
      starCatalogs: { ...INITIAL_SETTINGS.starCatalogs, enabled: false },
    },
    bias: {} as never,
    requests: new Set(),
    picking: {} as never,
    gpu: {
      renderTargets: null,
      labelRendererCosmo: null,
      markerLineRendererCosmo: null,
      texturedQuadRenderer: { bindAtlas: vi.fn() } as never,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() } as never,
      // `wireSlots` ends with `reevaluateDemand`, which enqueues onto this
      // rather than calling `slot.load()` directly.
      assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),
      loadProgress: null,
      fades: {
        register: vi.fn(),
        fadeTo: vi.fn(),
        setImmediate: vi.fn(),
        targetOf: vi.fn(() => null),
        opacityOf: vi.fn(() => 1),
        isAnyAnimating: vi.fn(() => false),
        tick: vi.fn(),
        destroy: vi.fn(),
        label: 'fadeRegistry',
      },
    } as never,
    booted: false,
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
    visibilityEntries: [...galaxyCatalogVisibility, ...cosmicWebDensityVisibility],
  } as unknown as EngineState;
  state.assetRows = expandCompanionRows([
    ...meshAssetRows(state),
    ...galaxyCatalogAssetRows(galaxyRuntime),
    ...cosmicWebDensityAssetRows(densityRuntime),
    ...structureAssetRows(structureRuntime),
  ]);
  state.slotsByKey = new Map(state.assetRows.map((row) => [row.key, row.slot]));
  return state;
}

function makeDeps(): BootstrapDeps {
  const cb: EngineCallbacks = {
    store: createAppStore().store,
    setSagaContext: vi.fn<() => void>() as never,
    runSaga: vi.fn<() => void>() as never,
  };
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb,
    composition: STUB_COMPOSITION,
    frameRef: { current: () => {} },
    handleRef: { current: null },
    allSlots: new Map(),
    selection: {
      resolvePick: () => null,
      extractRow: () => null,
      resolveFocusId: () => null,
      focusIdOf: () => null,
    },
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
      format: 'bgra8unorm' as GPUTextureFormat,
      unwatchHdrCapability: () => {},
    },
  };
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
    const points = new Map<SourceType, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.FamousGalaxy, famousSlot],
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
    const points = new Map<SourceType, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.FamousGalaxy, famousSlot],
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
    vi.mocked(filamentFetcher).mockClear();

    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();

    await wireSlots(state, deps);
    await state.subsystems.assetQueue.drain();

    // Default-on / structures-visible => fetched; the famous-meta sidecar is the Layer's slot, observed on the stub.
    expect(structureCatalogFetcher).toHaveBeenCalled();
    expect(state.slotsByKey.get('famousGalaxiesMeta')!.load).toHaveBeenCalled();
    expect(filamentFetcher).not.toHaveBeenCalled();
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
    const state = makeState({ points: new Map([[Source.SDSS, sdssSlot]]) });
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
    const points = new Map<SourceType, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.FamousGalaxy, famousSlot],
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
    // slots, the structure Layer's catalog slot, and core's mesh slots.
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
