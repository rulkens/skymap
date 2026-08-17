/**
 * wireSlots — focused tests for the highest-leverage invariants of the
 * second bootstrap phase, the demand-driven asset orchestrator.
 *
 * `bootstrap.test.ts` mocks this phase at module scope, so the orchestrator's
 * observable effects otherwise have no direct asserts — yet they gate "loading
 * screen ⇒ stars on canvas". The phase's internals (the synthetic-fallback
 * gate, the structure projection, the demand loop) each have their own unit tests
 * (`createSyntheticFallback.test.ts`, `wireStructureProjection.test.ts`,
 * `reevaluateDemand.test.ts` / `demandTable.test.ts`); this file pins that
 * wireSlots composes them into the right boot behaviour:
 *
 *   1. wireSlots returns synchronously (no await on galaxy catalog arrivals) and fires
 *      `onStatusChange({ kind: 'loading' })` once.
 *
 *   2. The demand loop loads the default boot set — the visible galaxy catalogs load
 *      via their point rows; per-arrival `ready` echoes still fire (via the
 *      synthetic-fallback gate's status subscriber), and the synthetic backstop
 *      still loads when every real galaxy catalog errors.
 *
 *   3. The loadProgress emitter is wired against EVERY installed slot.
 *      `deps.allSlots` is the single registry both the loading bar AND the dev
 *      panel read from, so a missed slot makes the dev panel quietly lie.
 *
 *   4. The composition wires are all present after boot: every impostor
 *      subsystem is assigned onto `state.subsystems.*`, every overlay /
 *      volume-master / label-layer fade handle is registered at its frame-1
 *      opacity, and the structures-visibility predicate threads through to the
 *      demand loop (structureCatalog loads at the visible default, skips when all
 *      structure categories are hidden).
 *
 * Mocking strategy: real `AssetSlot` instances are kept (pure CPU state
 * machines, easy to drive); fetchers are mocked so loads don't network;
 * thumbnail-subsystem factory is mocked so no real GPU device is needed;
 * load-progress emitter factory is spied so we can intercept the `allSlots`
 * Map. Per-source point slots are injected via a fake-slot helper — the
 * `galaxyCatalogSourceRegistry` module is mocked (see below) so wireSlots's
 * own mint loop is a no-op and the test's pre-seeded `state.assetSlots.points`
 * fakes survive untouched, which is the seam that makes the demand loop's
 * loads observable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createAppStore } from '../../../../src/store/createAppStore';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { BODY_IDS } from '../../../../src/data/bodies/bodyIds';
import { buildInitialSettings } from '../../../../src/state/settings/initialState';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { seedVolumeFields } from '../../../../src/data/volume/volumeFieldDefaults';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import {
  engineStatusChanged,
  engineStructureCountsChanged,
} from '../../../../src/state/engine/engineSlice';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// ── Module mocks ──────────────────────────────────────────────────────
//
// Replace every fetcher with a no-op resolved Promise.  None of our
// tests trigger an actual network request — the slots whose `.load()`
// fires inside wireSlots (famousGalaxiesMeta, filaments, cf4Density) need a
// fetcher that resolves quickly so the slot transitions to `ready`
// without timing out the test.  We don't care about the value because
// no commit step (here) reads it; the slots that have a commit are
// the per-source point slots, which we inject as fakes (see below).

vi.mock('../../../../src/services/loading/fetchers/cf4DensityFetcher', () => ({
  cf4DensityFetcher: vi.fn(async () => ({
    dims: [4, 4, 4],
    voxels: new Float32Array(64),
    valueMin: 0,
    valueMax: 1,
    frame: 'supergalactic',
    boundsKpc: { min: [0, 0, 0], max: [1, 1, 1] },
  })),
}));

vi.mock('../../../../src/services/loading/fetchers/filamentFetcher', () => ({
  filamentFetcher: vi.fn(async () => ({
    stripCount: 0,
    vertexCount: 0,
    strips: [] as unknown[],
  })),
}));

vi.mock('../../../../src/services/loading/fetchers/famousGalaxiesMetaFetcher', () => ({
  famousGalaxiesMetaFetcher: vi.fn(async () => ({ meta: [] })),
}));

// famousStarsMeta demands unconditionally at boot (like bodyTextureAtlas
// below), so its fetcher fires inside every wireSlots run; mock it so the
// test doesn't network.
vi.mock('../../../../src/services/loading/fetchers/famousStarsMetaFetcher', () => ({
  famousStarsMetaFetcher: vi.fn(async () => ({ meta: [] })),
}));

// The structure-catalog slot fires `.load({})` at boot; mock its fetcher so
// the test doesn't network.  An empty catalog is enough by default — the
// merge test overrides this mock with a populated payload so wireStructureProjection
// builds bulk records from the slot's ready value.
vi.mock('../../../../src/services/loading/fetchers/structureCatalogFetcher', () => ({
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

vi.mock('../../../../src/services/loading/fetchers/pgcAliasFetcher', () => ({
  pgcAliasFetcher: vi.fn(async () => new Map()),
}));

// The body-texture atlas row demands unconditionally at boot (`demand: () => true`),
// so its fetcher fires inside every wireSlots run. The real fetcher hits node's
// `fetch` with the RELATIVE dataUrl `/data/images/textures/body-atlas.webp`,
// which undici rejects ("Failed to parse URL" — no base). Mock it to a hollow
// bitmap: the slot's commit fans out to `earthRenderer`/`texturedBodyRenderer`
// (both absent in this fixture, so optional-chained to no-ops), so the value is
// never read here — it just needs to resolve so the slot reaches `ready`.
vi.mock('../../../../src/services/loading/fetchers/bodyAtlasFetcher', () => ({
  bodyAtlasFetcher: vi.fn(async () => ({}) as unknown as ImageBitmap),
}));

// MCPM is default-on, so the demand loop fires its load at boot.  Mock the
// fetcher so the slot resolves without networking.
vi.mock('../../../../src/services/loading/fetchers/mcpmFetcher', () => ({
  mcpmFetcher: vi.fn(async () => ({
    dims: [4, 4, 4],
    voxels: new Float32Array(64),
    valueMin: 0,
    valueMax: 1,
    frame: 'supergalactic',
    boundsKpc: { min: [0, 0, 0], max: [1, 1, 1] },
  })),
}));

// Task 12: wireSlots awaits loadDataManifest() before reevaluateDemand.
// Default resolves immediately (a resolved microtask) so every other test in
// this file sees the same "returns synchronously" shape as before; the
// deferred-manifest test below overrides this once with mockReturnValueOnce.
vi.mock('../../../../src/services/loading/dataManifest', () => ({
  loadDataManifest: vi.fn(async () => {}),
}));

vi.mock('../../../../src/services/loading/fetchers/syntheticVolumeFetcher', () => ({
  syntheticVolumeFetcher: vi.fn(async () => ({
    dims: [4, 4, 4],
    voxels: new Float32Array(64),
    valueMin: 0,
    valueMax: 1,
    frame: 'supergalactic',
    boundsKpc: { min: [0, 0, 0], max: [1, 1, 1] },
  })),
}));

// wireSlots constructs three impostor subsystems (galaxyAtlas,
// proceduralDisk, texturedDisk), each carrying a GPU-device dependency.
// Hollow factories that satisfy the call sites without touching the
// stubbed device.
vi.mock('../../../../src/services/engine/subsystems/galaxyAtlasSubsystem', () => ({
  createGalaxyAtlasSubsystem: vi.fn(() => ({
    getTextureView: vi.fn(() => ({}) as unknown as GPUTextureView),
    destroy: vi.fn(),
  })),
}));
vi.mock('../../../../src/services/engine/subsystems/proceduralDiskSubsystem', () => ({
  createProceduralDiskSubsystem: vi.fn(() => ({
    runFrame: vi.fn(),
    lastOutput: { instances: [] },
    destroy: vi.fn(),
  })),
}));
vi.mock('../../../../src/services/engine/subsystems/texturedDiskSubsystem', () => ({
  createTexturedDiskSubsystem: vi.fn(() => ({
    runFrame: vi.fn(),
    lastOutput: { quads: [], disks: [] },
    hasInFlightWork: vi.fn(() => false),
    setHiResFamous: vi.fn(),
    destroy: vi.fn(),
  })),
}));
// LOD-3 hi-res pair: the texture factory would call into
// `device.createTexture` without a real GPU — stub the resource handle
// and its consumer subsystem.
vi.mock('../../../../src/services/gpu/resources/hiResFamousTexture', () => ({
  createHiResFamousTexture: vi.fn(() => ({
    initTexture: vi.fn(),
    getTextureView: vi.fn(() => ({}) as unknown as GPUTextureView),
    getLayerSide: vi.fn(() => 1024),
    allocate: vi.fn(() => -1),
    touch: vi.fn(),
    release: vi.fn(),
    isLoaded: vi.fn(() => false),
    isFailed: vi.fn(() => false),
    markFailed: vi.fn(),
    layerForKey: vi.fn(() => undefined),
    uploadBitmap: vi.fn(),
    setEvictHandler: vi.fn(),
    destroy: vi.fn(),
  })),
}));
vi.mock('../../../../src/services/engine/subsystems/hiResFamousSubsystem', () => ({
  createHiResFamousSubsystem: vi.fn(() => ({
    runFrame: vi.fn(),
    lastOutput: { byFamousIdx: new Map() },
    destroy: vi.fn(),
  })),
}));

// wireSlots now mints the per-source point slots directly (moved from
// initGpu). This suite injects its OWN fake slots into `state.assetSlots.points`
// (see `bootPointSlots` / per-test `points` maps below) and drives them by
// hand, so `wireGalaxyCatalogSourceSlot` is stubbed to a no-op here —
// otherwise it would overwrite those fakes with real slots (whose commits hit
// the real fetchers, unmocked in this file) before the demand loop ever runs.
// `GALAXY_CATALOG_POINT_SOURCES` / `TIER_FETCHED_POINT_SOURCES` stay real
// (via importOriginal) since `createSyntheticFallback` reads them to know
// which sources to subscribe to.
vi.mock(
  '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry')
    >()),
    wireGalaxyCatalogSourceSlot: vi.fn(),
  }),
);

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

// Imported AFTER the mocks so wireSlots picks them up.
import { wireSlots } from '../../../../src/services/engine/phases/wireSlots';
import { famousGalaxiesMetaFetcher } from '../../../../src/services/loading/fetchers/famousGalaxiesMetaFetcher';
import { structureCatalogFetcher } from '../../../../src/services/loading/fetchers/structureCatalogFetcher';
import { mcpmFetcher } from '../../../../src/services/loading/fetchers/mcpmFetcher';
import { filamentFetcher } from '../../../../src/services/loading/fetchers/filamentFetcher';
import { cf4DensityFetcher } from '../../../../src/services/loading/fetchers/cf4DensityFetcher';
import { pgcAliasFetcher } from '../../../../src/services/loading/fetchers/pgcAliasFetcher';
import { loadDataManifest } from '../../../../src/services/loading/dataManifest';

// ── Test helpers ─────────────────────────────────────────────────────

/**
 * Build a fake `AssetSlot` whose lifecycle can be driven from the
 * test.  `fire(state)` triggers every subscriber synchronously — the
 * same shape `AssetSlot` uses in production (subscribe → state
 * transition → notify).
 *
 * We don't try to mirror `AssetSlot`'s full state-machine semantics
 * because wireSlots only consumes two ingress signals from each
 * per-source slot: the `subscribe(...)` callback (used by the
 * all-arrivals gate) and the `load(...)` method (used to kick off the
 * fetch).  Modelling more would invite coupling tests to internals.
 */
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
 * reads true.  Idle galaxy catalog fakes keep the synthetic-fallback gate waiting
 * rather than arming + re-running demand — the live-boot shape.
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

/**
 * Minimal `EngineState` shaped for wireSlots's body.  Mirrors the
 * post-`initGpu` shape: the GPU renderers are present (so commit
 * subscribers don't NPE), the per-source slot map is empty (the test
 * populates it per-case), the galaxy catalogs are seeded all-enabled via
 * `GALAXY_CATALOG_IDS` — a uniform all-on scenario, deliberately BROADER than
 * the engine's boot seed, which derives each `enabled` from the registry's
 * `visible` field and so leaves default-off catalogs (desiDeep) out. All-on
 * keeps the demand loop — which reads
 * `settings.galaxyCatalogs.items[id].enabled` — demanding every catalog whose
 * slot a test provides. The volume fields are seeded via
 * `settings.volumes.items: seedVolumeFields()` (so the MCPM demand
 * predicate reads true at boot, as wireSlots expects).
 */
function makeState(
  overrides: Partial<{
    points: Map<SourceType, ReturnType<typeof makeFakeSlot>>;
    markerCategoryVisibility: Record<string, boolean>;
    labelCategoryVisibility: Record<string, boolean>;
  }> = {},
): EngineState {
  const points = overrides.points ?? new Map();
  const allVisible: Record<string, boolean> = {
    cluster: true,
    supercluster: true,
    void: true,
    famousGalaxy: true,
    group: true,
  };
  // Translate the per-axis override maps into the per-category item rows the
  // structureCatalog demand predicate reads (ring axis = `enabled`, label axis
  // = `labelEnabled`). Defaults all-visible ⇒ structureCatalog demanded.
  const markerVis = overrides.markerCategoryVisibility ?? allVisible;
  const labelVis = overrides.labelCategoryVisibility ?? allVisible;
  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const cat of ['cluster', 'supercluster', 'void', 'group']) {
    structureItems[cat] = { enabled: markerVis[cat] ?? true, labelEnabled: labelVis[cat] ?? true };
  }
  const data = createEngineData();
  // Pull the singleton-overlay + star-catalog slices from the real seed so the
  // demand loop's `settings.flow.enabled` / `settings.constellations.enabled` /
  // `settings.starCatalogs.enabled` reads resolve instead of throwing on an
  // undefined slice (which reevaluateDemand would swallow as a per-row warn).
  // Flow + constellations default OFF, so no overlay load fires. starCatalogs is
  // forced OFF here (its Gaia row is registry-visible, so leaving the master gate
  // on would demand a real star-bin fetch this fixture provides no slot for).
  const seed = buildInitialSettings();
  return {
    // Top-level data tier — its own root field on EngineState; the source
    // expression `req(state.tier)` reads it, and the synthetic-fallback
    // assertion checks `tier: state.tier`.
    tier: 'medium',
    settings: {
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        provenance: DEFAULT_GALAXY_PROVENANCE,
        // All galaxy catalogs enabled (a uniform test scenario; the real boot
        // seed derives `enabled` from each registry entry's `visible`, so
        // desiDeep boots off) — galaxy catalog demand reads these `enabled`
        // bits (not `sources.drawMask`), so the boot-load expectations for
        // sdss/2mrs/glade hang off this seed.
        items: Object.fromEntries(
          GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
        ),
      },
      tonemap: { exposure: 1.0, curve: 'reinhard' },
      bias: { mode: 'off', absMagLimit: -18 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true, labelEnabled: true },
      // seedFades registers the zone-of-avoidance band handle too; pulled
      // from the real seed like flow/constellations below.
      zoneOfAvoidance: seed.zoneOfAvoidance,
      filaments: { enabled: false, intensity: 1.0 },
      // seedFades reads orbitTrails.enabled for the settings-derived orbit-trails
      // seed (always present, unlike the demand-loaded flow/filament rows).
      orbitTrails: { enabled: true },
      volumes: { enabled: true, items: seedVolumeFields() },
      // seedFades registers a caption handle per body row, so these must exist.
      bodies: {
        items: Object.fromEntries(
          BODY_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
        ),
      },
      // Overridable so a test can hide every category and pin the bug-fix
      // (structureCatalog must NOT load when nothing structural is visible).
      structures: { enabled: true, items: structureItems },
      // Singleton overlays (default-off) + star catalogs (master gate forced off
      // — see the `seed` note above) so every demand row's settings read resolves.
      flow: seed.flow,
      constellations: seed.constellations,
      starCatalogs: { ...seed.starCatalogs, enabled: false },
    },
    bias: {} as never,
    // The synthetic-fallback gate writes `state.requests.add('syntheticFallback')`
    // and the demand loop reads request flags — both need a live Set.
    requests: new Set(),
    data,
    picking: {} as never,
    gpu: {
      // Renderers are stubs — the slot commits we mint inside wireSlots
      // optional-chain through them.  Filament renderer is set so the
      // filaments slot's commit doesn't bail early; the scalar volume
      // renderer is stubbed so CF-4 and synthetic commits can land.
      galaxyPointRenderer: { totalCount: () => 0, loadedSources: () => [] as unknown[] } as never,
      galaxyPickRenderer: null,
      renderTargets: null,
      filamentRenderer: {
        upload: vi.fn(async () => {}),
      } as never,
      labelRenderer: null,
      markerLineRenderer: null,
      texturedQuadRenderer: { bindAtlas: vi.fn() } as never,
      texturedDiskRenderer: { bindAtlas: vi.fn(), bindHiResArray: vi.fn() } as never,
      proceduralDiskRenderer: {} as never,
      volumeFieldRenderer: {
        upload: vi.fn(),
      } as never,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() } as never,
      // `wireSlots` ends with `reevaluateDemand`, which enqueues onto this
      // rather than calling `slot.load()` directly.
      assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY),
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      hiResFamous: null,
      hiResFamousTexture: null,
      loadProgress: null,
      // wireStructureProjection (called from wireSlots) writes the static
      // anchors + bulk clusters into `state.data.structures`; tests read them
      // back from that real store. wireSlots calls fades.register on filament
      // + overlay + label-layer handles after the slot mints — stub so it
      // doesn't crash.
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
    } as never,
    cam: null,
    // Far from Earth — buildDemandCtx assembles the eye from pose + projection,
    // so both must be present; a far resting pose keeps the proximity-gated
    // body-texture rows out of the demand set (boot-load expectations stay
    // sdss/2mrs/glade/…, no Blue Marble fetch).
    cameraRuntime: {
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity } },
      projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
      lastRenderedSimDays: { current: CONST_J2000 },
    },
    assetSlots: {
      points: points as Map<SourceType, never>,
      // Real (empty) map: installSlots routes the registry-built star-catalog
      // slots here, so the fixture must carry the destination.
      starCatalogs: new Map(),
      filaments: null,
      famousGalaxiesMeta: null,
      structureCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      mcpm: null,
      // Real (empty) map: installLoadProgress walks it, and the body-texture
      // rows are `built: 'external'` so the construction pass skips them.
      bodyTextures: new Map(),
    },
  } as unknown as EngineState;
}

/** Build a stub `BootstrapDeps` with a populated `phaseLocals`. */
function makeDeps(): BootstrapDeps {
  const cb: EngineCallbacks = {
    store: createAppStore().store,
    setSagaContext: vi.fn<() => void>() as never,
  };
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
      unwatchHdrCapability: () => {},
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireSlots', () => {
  beforeEach(() => {
    emitterSpy.mockClear();
  });

  it('returns synchronously (does not wait on galaxy catalog arrivals) and fires `loading` status', async () => {
    // Progressive disclosure: wireSlots mints + kicks off loads then
    // returns. Per-arrival `ready` emissions happen later via the
    // subscribers it registered, not by awaiting in this body.
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

    // No slots fired yet — wireSlots must still resolve.
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

    // The `loading` status is dispatched exactly once — it's the one-shot
    // "show the loading screen" signal, not a per-arrival echo (those are
    // the `ready` emissions asserted elsewhere).
    const loadingDispatches = dispatchSpy.mock.calls.filter((c) => {
      const action = c[0] as ReturnType<typeof engineStatusChanged>;
      return action.type === engineStatusChanged.type && action.payload.kind === 'loading';
    });
    expect(loadingDispatches.length).toBe(1);
  });

  it('starts no load until the data manifest has resolved', async () => {
    // Point-slot setup copied from "returns synchronously ... and fires
    // `loading` status" above — plain, unfired point slots, same drain, same
    // four `.load()` assertions. Also pins two sidecar fetchers from the
    // default boot set (mcpm + structureCatalog — see the sibling
    // "demand loop loads the default boot sidecar set" test) so a future
    // refactor that split sidecar dispatch onto a second, differently-awaited
    // path would fail here, not just on the point-slot half. Famous-galaxies
    // -meta is left out: its demand predicate reads Famous's slot state,
    // which needing an extra pre-fire here would collide with the point-slot
    // assertions above (a fired slot is no longer "about to load").
    let resolveManifest!: () => void;
    const deferred = new Promise<void>((resolve) => {
      resolveManifest = resolve;
    });
    vi.mocked(loadDataManifest).mockReturnValueOnce(deferred);
    vi.mocked(mcpmFetcher).mockClear();
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
    expect(mcpmFetcher).not.toHaveBeenCalled();
    expect(structureCatalogFetcher).not.toHaveBeenCalled();

    resolveManifest();
    await pending;
    // Same drain as the sibling test: the boot demand pass enqueues rather
    // than loading, so every demanded row needs the queue drained before
    // its slot's `.load()` is observable.
    await state.subsystems.assetQueue.drain();

    expect(sdssSlot.load).toHaveBeenCalled();
    expect(twoMrsSlot.load).toHaveBeenCalled();
    expect(gladeSlot.load).toHaveBeenCalled();
    expect(famousSlot.load).toHaveBeenCalled();
    expect(mcpmFetcher).toHaveBeenCalled();
    expect(structureCatalogFetcher).toHaveBeenCalled();
  });

  it('assigns all five impostor subsystems onto state.subsystems', async () => {
    // wireImpostorSubsystems builds the LOD-1/2/3 GPU subsystems and writes
    // each onto `state.subsystems.*`.  The downstream frame loop reads these
    // five by name; a missed assignment is a silent "thumbnails never draw"
    // bug.  The factories are mocked at module scope to hollow objects, so
    // each assignment is merely truthy here — the contract under test is
    // "all five slots are populated", not their internals.
    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();

    await wireSlots(state, deps);

    expect(state.subsystems.galaxyAtlas).not.toBeNull();
    expect(state.subsystems.proceduralDisks).not.toBeNull();
    expect(state.subsystems.texturedDisks).not.toBeNull();
    expect(state.subsystems.hiResFamous).not.toBeNull();
    expect(state.subsystems.hiResFamousTexture).not.toBeNull();
  });

  it('registers the overlay, volume-master, and label-layer fade handles', async () => {
    // seedFades pins each layer's frame-1 opacity in the fade
    // registry.  A missed handle means that layer's toggle has nothing to
    // multiply against (or flashes at the wrong opacity on frame 1).  We
    // assert the handle shapes as a SUBSET — wireSlots also registers a
    // filament overlay/label handle when it mints the filaments slot, so an
    // exact-length check would break for the wrong reason.
    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();

    await wireSlots(state, deps);

    const register = state.subsystems.fades.register as ReturnType<typeof vi.fn>;
    const handles = register.mock.calls.map((c) => c[0]);
    const hasHandle = (h: unknown): boolean =>
      handles.some((got) => JSON.stringify(got) === JSON.stringify(h));

    expect(hasHandle({ kind: 'milkyWay' })).toBe(true);
    expect(hasHandle({ kind: 'overlay', id: 'proceduralDisks' })).toBe(true);
    expect(hasHandle({ kind: 'overlay', id: 'texturedDisks' })).toBe(true);
    expect(hasHandle({ kind: 'volumesMaster' })).toBe(true);
    expect(hasHandle({ kind: 'labelLayer', layer: 'milkyWay' })).toBe(true);
    // No item-less structure handle: structure labels use per-item handles,
    // and produceStructureLabels fires each category's load-in.
    expect(hasHandle({ kind: 'labelLayer', layer: 'galaxy' })).toBe(true);
    expect(hasHandle({ kind: 'labelLayer', layer: 'scaleBar' })).toBe(true);

    // Opacities are deterministic under the default fixture (milkyWay disk +
    // label enabled, volumes master enabled) — all gate to 1.
    const opacityFor = (h: unknown): number | undefined => {
      const call = register.mock.calls.find((c) => JSON.stringify(c[0]) === JSON.stringify(h));
      return call?.[1] as number | undefined;
    };
    expect(opacityFor({ kind: 'milkyWay' })).toBe(1);
    expect(opacityFor({ kind: 'volumesMaster' })).toBe(1);
    // The milkyWay label layer is now seeded from settings.milkyWay.labelEnabled
    // (default true), not registered at 0 for a producer to ramp.
    expect(opacityFor({ kind: 'labelLayer', layer: 'milkyWay' })).toBe(1);
    expect(opacityFor({ kind: 'labelLayer', layer: 'scaleBar' })).toBe(1);
  });

  it('demand loop loads the default boot sidecar set (mcpm + structureCatalog + famousGalaxiesMeta) and not the off-by-default ones', async () => {
    // Boot parity: the old imperative boot loop loaded MCPM (default-on volume)
    // + the cluster catalog (structures visible) + famous-galaxies-meta but left
    // filaments (off), CF-4 density (off) and the lazy PGC alias idle.  After
    // the refactor those loads come from reevaluateDemand reading the
    // construction-seeded state — same outcome.  Each sidecar's load is
    // observable through its (mocked) fetcher; clear them first since the
    // module-scoped mocks persist across tests.
    vi.mocked(mcpmFetcher).mockClear();
    vi.mocked(structureCatalogFetcher).mockClear();
    vi.mocked(famousGalaxiesMetaFetcher).mockClear();
    vi.mocked(filamentFetcher).mockClear();
    vi.mocked(cf4DensityFetcher).mockClear();
    vi.mocked(pgcAliasFetcher).mockClear();

    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();

    await wireSlots(state, deps);
    // Drain the asset queue for the same reason as the case above.
    await state.subsystems.assetQueue.drain();

    // Default-on / structures-visible / famous-loading ⇒ fetched.
    expect(mcpmFetcher).toHaveBeenCalled();
    expect(structureCatalogFetcher).toHaveBeenCalled();
    expect(famousGalaxiesMetaFetcher).toHaveBeenCalled();
    // Default-off / lazy ⇒ never fetched at boot.
    expect(filamentFetcher).not.toHaveBeenCalled();
    expect(cf4DensityFetcher).not.toHaveBeenCalled();
    expect(pgcAliasFetcher).not.toHaveBeenCalled();
  });

  it('does not load structureCatalog when every structure category is hidden (bug-fix integration pin)', async () => {
    // demandTable.test.ts pins the cluster predicate in isolation; this pins
    // that wireSlots actually threads the visibility records THROUGH to the
    // demand loop end-to-end.  Old code loaded the .ccat unconditionally; the
    // fix gates it on any structure category being visible.  With both marker
    // and label visibility all-false the predicate is false, so the boot
    // demand pass must skip structureCatalog entirely.
    vi.mocked(structureCatalogFetcher).mockClear();

    const allHidden = { cluster: false, supercluster: false, void: false, famousGalaxy: false };
    const state = makeState({
      points: bootPointSlots(),
      markerCategoryVisibility: allHidden,
      labelCategoryVisibility: allHidden,
    });
    const deps = makeDeps();

    await wireSlots(state, deps);

    expect(structureCatalogFetcher).not.toHaveBeenCalled();
  });

  it('fires `ready` status with a running total each time a galaxy catalog arrives', async () => {
    // Semantic (b): on each per-source `ready` with count > 0, emit
    // `kind: 'ready'` with the running total from galaxyPointRenderer.totalCount().
    // The status bar's job here is "the data is appearing" — not "boot
    // is done" — so emissions repeat.
    const sdssSlot = makeFakeSlot('sdss-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const points = new Map<SourceType, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.Glade, gladeSlot],
    ]);
    const state = makeState({ points });
    let total = 0;
    // Drive the galaxyPointRenderer.totalCount() through the fake slot ready firings.
    state.gpu.galaxyPointRenderer = {
      totalCount: () => total,
      loadedSources: () => [] as unknown[],
    } as never;
    const deps = makeDeps();
    const dispatchSpy = vi.spyOn(deps.cb.store, 'dispatch');
    await wireSlots(state, deps);

    total = 10000;
    sdssSlot.fire(readyValue(10000));
    total = 30000;
    gladeSlot.fire(readyValue(20000));

    const readyStatuses = dispatchSpy.mock.calls
      .map((c) => c[0] as ReturnType<typeof engineStatusChanged>)
      .filter((a) => a.type === engineStatusChanged.type && a.payload.kind === 'ready')
      .map((a) => a.payload);
    expect(readyStatuses.length).toBe(2);
    expect(readyStatuses[0]).toMatchObject({ kind: 'ready', count: 10000 });
    expect(readyStatuses[1]).toMatchObject({ kind: 'ready', count: 30000 });
  });

  it('synthetic-fallback path fires `load(...)` on the synthetic slot when every real galaxy catalog errors', async () => {
    // The fallback condition: SDSS, 2MRS, Glade all settle with no
    // `ready` + `count > 0`. Famous is curated and doesn't count
    // either way. With the progressive-disclosure refactor the
    // fallback is a background subscriber registered before loads
    // fire, so we just need to drive each real slot through `error`
    // and assert `synthSlot.load` happened.
    const sdssSlot = makeFakeSlot('sdss-points');
    const twoMrsSlot = makeFakeSlot('2mrs-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const famousSlot = makeFakeSlot('famous-points');
    const synthSlot = makeFakeSlot('synthetic-points');
    const points = new Map<SourceType, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.FamousGalaxy, famousSlot],
      [Source.Synthetic, synthSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    await wireSlots(state, deps);

    sdssSlot.fire(errorValue('sdss boom'));
    twoMrsSlot.fire(errorValue('2mrs boom'));
    gladeSlot.fire(errorValue('glade boom'));
    famousSlot.fire(errorValue('famous boom'));

    // Drain the asset queue for the same reason as the boot cases above: the
    // fallback's re-evaluation enqueues the synthetic row behind whatever the
    // boot pass already put in flight.
    await state.subsystems.assetQueue.drain();
    expect(synthSlot.load).toHaveBeenCalledTimes(1);
    expect(synthSlot.load).toHaveBeenCalledWith({
      source: Source.Synthetic,
      tier: state.tier,
    });
  });

  it('loadProgress emitter is constructed with a slot registry that includes every minted slot name', async () => {
    // The `allSlots` Map is the load-progress emitter's input AND the
    // dev panel's registry — both consume the same `slot.state()` set.
    // If a future refactor drops a slot from this Map (e.g. forgets
    // the new `synthSlot.name` entry), the loading bar and the dev
    // panel would silently disagree, and an integration bug could go
    // unnoticed for releases.  This test pins the post-mint contents.
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

    // The emitter is constructed once and the registry it receives is
    // the same Map instance as `deps.allSlots` — the loading bar and
    // the dev panel MUST share a registry.
    expect(emitterSpy).toHaveBeenCalledTimes(1);
    const capturedRegistry = emitterSpy.mock.calls[0]![0] as Map<string, unknown>;
    expect(capturedRegistry).toBe(deps.allSlots);

    // Registry includes the per-source point slots (by `.name`) plus
    // the sidecar slots wireSlots itself mints (filaments, famous-galaxies-meta,
    // pgc-aliases, CF-4, MCPM) plus synthetic fixtures (DEV-only —
    // vitest runs as DEV). Asserted as a superset so additive changes
    // don't break the test for the wrong reason.
    const names = new Set(capturedRegistry.keys());
    expect(names.has('sdss-points')).toBe(true);
    expect(names.has('2mrs-points')).toBe(true);
    expect(names.has('glade-points')).toBe(true);
    expect(names.has('famous-points')).toBe(true);
    expect(names.has('filaments')).toBe(true);
    expect(names.has('famous-galaxies-meta')).toBe(true);
    expect(names.has('structure-catalog')).toBe(true);
    expect(names.has('pgc-aliases')).toBe(true);
  });

  it('wires static cluster/supercluster/void anchors unconditionally (no URL gate)', async () => {
    // No URL gate: wireStructureProjection always publishes the static anchors
    // synchronously into the structure store's 'anchors' group at boot.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    const state = makeState();
    const deps = makeDeps();
    await wireSlots(state, deps);
    // The real structure store reflects setGroup writes immediately.
    expect(state.data.structures.byCategory('cluster').length).toBeGreaterThan(0);
    expect(state.data.structures.byCategory('supercluster').length).toBeGreaterThan(0);
    expect(state.data.structures.byCategory('void').length).toBeGreaterThan(0);
  });

  it('lands bulk clusters + superclusters in the structure store, keeping anchors', async () => {
    // The structure-catalog slot's boot load resolves with one cluster + one
    // supercluster; wireStructureProjection builds bulk records (via the real
    // structureCatalogToStructures) and writes them to the structure store's
    // 'bulk' group, alongside the static-anchor group from boot.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    vi.mocked(structureCatalogFetcher).mockResolvedValueOnce({
      catalog: {
        count: 2,
        positions: new Float32Array([1, 2, 3, 4, 5, 6]),
        physicalRadiusMpc: new Float32Array([1.5, 30]),
        apparentRadiusMpc: new Float32Array([3, 30]),
        significance: new Float32Array([10, 25]),
        category: new Uint8Array([0, 1]),
      },
      meta: [
        { id: 'coma', names: ['Coma'], abell: 'A1656', description: '' },
        { id: 'shapley', names: ['Shapley'], abell: null, description: '' },
      ],
    } as never);

    // Idle galaxy catalog fakes keep the synthetic gate waiting so demand runs once.
    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();
    await wireSlots(state, deps);
    // Let the async structure-catalog fetch + its subscriber settle.
    await new Promise((r) => setTimeout(r, 0));

    // Bulk records land in the structure store.
    expect(state.data.structures.byId('cluster-bulk-coma')).not.toBeNull();
    expect(state.data.structures.byId('supercluster-bulk-shapley')).not.toBeNull();
    // Static anchors survive the bulk write (separate group).
    expect(state.data.structures.byCategory('cluster').length).toBeGreaterThan(0);
  });

  it('emits per-category structure counts that grow when the bulk catalog lands', async () => {
    // The Structures panel reads these counts to annotate its toggles.
    // rebuildAllStructures fires onStructureCountsChange on every merge: once at
    // boot (static anchors only) and again when the bulk .ccat resolves.
    // Asserting the DELTA (one extra cluster + one extra SC, voids
    // unchanged) keeps the test robust to seed-anchor count changes.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    vi.mocked(structureCatalogFetcher).mockResolvedValueOnce({
      catalog: {
        count: 2,
        positions: new Float32Array([1, 2, 3, 4, 5, 6]),
        physicalRadiusMpc: new Float32Array([1.5, 30]),
        apparentRadiusMpc: new Float32Array([3, 30]),
        significance: new Float32Array([10, 25]),
        category: new Uint8Array([0, 1]),
      },
      meta: [
        { id: 'coma', names: ['Coma'], abell: 'A1656', description: '' },
        { id: 'shapley', names: ['Shapley'], abell: null, description: '' },
      ],
    } as never);

    // Idle galaxy catalog fakes keep the synthetic gate waiting so demand runs once —
    // a double-run would re-trigger the (non-idempotent) structure-catalog load
    // and race the mock once-value against its empty default.
    const state = makeState({ points: bootPointSlots() });
    const deps = makeDeps();
    const dispatchSpy = vi.spyOn(deps.cb.store, 'dispatch');
    await wireSlots(state, deps);
    await new Promise((r) => setTimeout(r, 0));

    const counts = dispatchSpy.mock.calls
      .map((c) => c[0] as ReturnType<typeof engineStructureCountsChanged>)
      .filter((a) => a.type === engineStructureCountsChanged.type)
      .map((a) => a.payload);
    expect(counts.length).toBeGreaterThanOrEqual(2);
    const first = counts[0]!;
    const last = counts[counts.length - 1]!;
    // Bulk adds one cluster (Coma) + one supercluster (Shapley); voids
    // come only from the static seed, so that count is unchanged.
    expect(last.cluster!).toBe(first.cluster! + 1);
    expect(last.supercluster!).toBe(first.supercluster! + 1);
    expect(last.void!).toBe(first.void!);
  });
});
