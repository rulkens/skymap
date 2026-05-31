/**
 * wireSlots — focused tests for the highest-leverage invariants of the
 * second bootstrap phase.
 *
 * `bootstrap.test.ts` mocks this phase at module scope, so the per-slot
 * mint sites, the all-arrivals gate, the synthetic-fallback path, and
 * the loadProgress emitter wiring otherwise have no direct asserts —
 * yet those four lines of logic gate "loading screen ⇒ stars on
 * canvas". Three invariants targeted here:
 *
 *   1. The all-arrivals gate's Promise<void> resolves once every
 *      per-source slot reports `ready`, AND wireSlots completes (rather
 *      than hanging). The lifecycle callbacks that take the engine out
 *      of `loading` depend on this.
 *
 *   2. The synthetic-fallback path mints + loads a synthetic-source
 *      slot when every real survey errored out — a DEV-only safety net
 *      invisible in production. A refactor that drops the fallback
 *      would silently ship "all-real-surveys-down ⇒ black screen".
 *
 *   3. The loadProgress emitter is wired against EVERY minted slot.
 *      `deps.allSlots` is the single registry both the loading bar AND
 *      the dev panel read from, so a missed slot makes the dev panel
 *      quietly lie.
 *
 * Mocking strategy: real `AssetSlot` instances are kept (pure CPU
 * state machines, easy to drive); fetchers are mocked so loads don't
 * network; thumbnail-subsystem factory is mocked so no real GPU
 * device is needed; load-progress emitter factory is spied so we can
 * intercept the `allSlots` Map. Per-source point slots are injected
 * via a fake-slot helper — wireSlots reads them off
 * `state.assetSlots.points` (initGpu mints them in production), which
 * is the seam that makes the all-arrivals gate testable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// ── Module mocks ──────────────────────────────────────────────────────
//
// Replace every fetcher with a no-op resolved Promise.  None of our
// tests trigger an actual network request — the slots whose `.load()`
// fires inside wireSlots (famousMeta, filaments, cf4Density) need a
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

vi.mock('../../../../src/services/loading/fetchers/famousMetaFetcher', () => ({
  famousMetaFetcher: vi.fn(async () => ({ meta: [] })),
}));

// The cluster-catalog slot fires `.load({})` at boot; mock its fetcher so
// the test doesn't network.  An empty catalog is enough — the merge test
// pre-seeds `state.sources.clusterBulk` directly, so the slot's own value
// is irrelevant here.
vi.mock('../../../../src/services/loading/fetchers/clusterCatalogFetcher', () => ({
  clusterCatalogFetcher: vi.fn(async () => ({
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
  PROCEDURAL_DISK_FADE_START_PX: 8,
  PROCEDURAL_DISK_FADE_END_PX: 14,
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
  HI_RES_TRIGGER_PX: 200,
  HI_RES_FADE_BAND_PX: 60,
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

// Imported AFTER the mocks so wireSlots picks them up.
import { wireSlots } from '../../../../src/services/engine/phases/wireSlots';
import { famousMetaFetcher } from '../../../../src/services/loading/fetchers/famousMetaFetcher';
import { clusterCatalogFetcher } from '../../../../src/services/loading/fetchers/clusterCatalogFetcher';

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
    forceReload: vi.fn(),
    cancel: vi.fn(),
    fire(s) {
      current = s;
      // Subs may unsubscribe themselves during dispatch — iterate a copy.
      for (const fn of Array.from(subs)) fn(s);
    },
  };
  return slot;
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
 * populates it per-case), and the settings bag has the slots wireSlots
 * inspects (`volumes.fields`).
 */
function makeState(
  overrides: Partial<{
    points: Map<SourceType, ReturnType<typeof makeFakeSlot>>;
  }> = {},
): EngineState {
  const points = overrides.points ?? new Map();
  return {
    settings: {
      points: {
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: true,
        realOnly: false,
      },
      tonemap: { exposure: 1.0, curve: 'reinhard' },
      camera: { autoRotate: false },
      bias: { mode: 'off', absMagLimit: -18 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true },
      filaments: { enabled: false, intensity: 1.0 },
      volumes: { masterEnabled: true, fields: {} },
    },
    bias: {} as never,
    sources: {
      catalogs: new Map(),
      pickMask: 0xff,
      drawMask: 0xff,
      famousMeta: [],
      tier: 'medium',
    },
    picking: {} as never,
    gpu: {
      // Renderers are stubs — the slot commits we mint inside wireSlots
      // optional-chain through them.  Filament renderer is set so the
      // filaments slot's commit doesn't bail early; the scalar volume
      // renderer is stubbed so CF-4 and synthetic commits can land.
      renderer: { totalCount: () => 0, loadedSources: () => [] as unknown[] } as never,
      pickRenderer: null,
      postProcess: null,
      filamentRenderer: {
        upload: vi.fn(async () => {}),
      } as never,
      labelRenderer: null,
      markerLineRenderer: null,
      texturedQuadRenderer: { bindAtlas: vi.fn() } as never,
      texturedDiskRenderer: { bindAtlas: vi.fn(), bindHiResArray: vi.fn() } as never,
      proceduralDiskRenderer: {} as never,
      milkyWayRenderer: null,
      scalarVolumeRenderer: {
        addField: vi.fn(),
        setIntensity: vi.fn(),
        setEnabled: vi.fn(),
        setContrast: vi.fn(),
        setFieldPalette: vi.fn(),
        setDensityScale: vi.fn(),
        setEnvelope: vi.fn(),
      } as never,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() } as never,
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      hiResFamous: null,
      hiResFamousTexture: null,
      loadProgress: null,
      // wireSlots unconditionally wires static cluster/supercluster/void
      // anchors via `state.subsystems.pois.setPois(...)`, so this mock
      // must be callable even when the test isn't asserting on POIs.
      // `getPoisForCategory` filters the last-published list so the
      // `onStructureCountsChange` echo in `rebuildAllPois` resolves real
      // per-category counts (only exercised when a test wires that
      // callback; otherwise the optional call short-circuits).
      pois: (() => {
        let current: readonly PointOfInterest[] = [];
        return {
          setPois: vi.fn((pois: readonly PointOfInterest[]) => {
            current = pois;
          }),
          getPoisForCategory: (category: string) =>
            current.filter((p) => p.category === category),
        };
      })() as never,
      // wireSlots calls fades.register on filament + overlay +
      // label-layer handles after the slot mints — stub so it doesn't crash.
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
    initialCamSnapshot: null,
    assetSlots: {
      points: points as Map<SourceType, never>,
      filaments: null,
      famousMeta: null,
      clusterCatalog: null,
      pgcAlias: null,
      cf4Density: null,
    },
  } as unknown as EngineState;
}

/** Build a stub `BootstrapDeps` with a populated `phaseLocals`. */
function makeDeps(): BootstrapDeps {
  const cb: EngineCallbacks = {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onSelectionChange: vi.fn() } as never,
    // wireSlots fires `cb.filaments?.onReady` and `cb.volumes?.onFieldsChanged`
    // when those slots resolve; both are optional so absence is fine, but
    // including them lets the test inspect call counts if needed.
    filaments: { onReady: vi.fn() } as never,
    volumes: { onFieldsChanged: vi.fn() } as never,
    sources: { onCatalogReady: vi.fn(), onLoadProgress: vi.fn() } as never,
  } as unknown as EngineCallbacks;
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    fpsCounter: { sample: () => null } as unknown as BootstrapDeps['fpsCounter'],
    lastReportedFps: { current: null },
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireSlots', () => {
  beforeEach(() => {
    emitterSpy.mockClear();
  });

  it('returns synchronously (does not wait on survey arrivals) and fires `loading` status', async () => {
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
      [Source.Famous, famousSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    // No slots fired yet — wireSlots must still resolve.
    await wireSlots(state, deps);

    expect(deps.cb.lifecycle?.onStatusChange).toHaveBeenCalledWith({ kind: 'loading' });
    expect(sdssSlot.load).toHaveBeenCalled();
    expect(twoMrsSlot.load).toHaveBeenCalled();
    expect(gladeSlot.load).toHaveBeenCalled();
    expect(famousSlot.load).toHaveBeenCalled();
  });

  it('fires `ready` status with a running total each time a survey arrives', async () => {
    // Semantic (b): on each per-source `ready` with count > 0, emit
    // `kind: 'ready'` with the running total from renderer.totalCount().
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
    // Drive the renderer.totalCount() through the fake slot ready firings.
    state.gpu.renderer = {
      totalCount: () => total,
      loadedSources: () => [] as unknown[],
    } as never;
    const deps = makeDeps();
    await wireSlots(state, deps);

    total = 10000;
    sdssSlot.fire(readyValue(10000));
    total = 30000;
    gladeSlot.fire(readyValue(20000));

    const calls = (deps.cb.lifecycle?.onStatusChange as ReturnType<typeof vi.fn>).mock.calls;
    const readyCalls = calls.filter((c) => (c[0] as { kind: string }).kind === 'ready');
    expect(readyCalls.length).toBe(2);
    expect(readyCalls[0]![0]).toMatchObject({ kind: 'ready', count: 10000 });
    expect(readyCalls[1]![0]).toMatchObject({ kind: 'ready', count: 30000 });
  });

  it('synthetic-fallback path fires `load(...)` on the synthetic slot when every real survey errors', async () => {
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
      [Source.Famous, famousSlot],
      [Source.Synthetic, synthSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    await wireSlots(state, deps);

    sdssSlot.fire(errorValue('sdss boom'));
    twoMrsSlot.fire(errorValue('2mrs boom'));
    gladeSlot.fire(errorValue('glade boom'));
    famousSlot.fire(errorValue('famous boom'));

    expect(synthSlot.load).toHaveBeenCalledTimes(1);
    expect(synthSlot.load).toHaveBeenCalledWith({
      source: Source.Synthetic,
      tier: state.sources.tier,
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
      [Source.Famous, famousSlot],
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
    // the sidecar slots wireSlots itself mints (filaments, famous-meta,
    // pgc-aliases, CF-4, MCPM) plus synthetic fixtures (DEV-only —
    // vitest runs as DEV). Asserted as a superset so additive changes
    // don't break the test for the wrong reason.
    const names = new Set(capturedRegistry.keys());
    expect(names.has('sdss-points')).toBe(true);
    expect(names.has('2mrs-points')).toBe(true);
    expect(names.has('glade-points')).toBe(true);
    expect(names.has('famous-points')).toBe(true);
    expect(names.has('filaments')).toBe(true);
    expect(names.has('famous-meta')).toBe(true);
    expect(names.has('cluster-catalog')).toBe(true);
    expect(names.has('pgc-aliases')).toBe(true);
  });

  it('wires static cluster/supercluster/void anchors unconditionally (no URL gate)', async () => {
    // No `?anchors=1` gate: the POI subsystem always receives the
    // static anchor list.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    const state = makeState();
    const deps = makeDeps();
    let received: readonly PointOfInterest[] = [];
    state.subsystems.pois.setPois = (pois) => {
      received = pois;
    };
    await wireSlots(state, deps);
    expect(received.length).toBeGreaterThan(0);
    expect(received.some((p) => p.category === 'cluster')).toBe(true);
    expect(received.some((p) => p.category === 'supercluster')).toBe(true);
    expect(received.some((p) => p.category === 'void')).toBe(true);
  });

  it('wires famous POIs alongside static anchors once meta + catalog arrive', async () => {
    // Pre-populate the famous catalog (worldPos) and have the famous-meta
    // companion fetcher resolve with the meta sidecar — the realistic
    // arrival path.  wireSlots fires the companion `.load()` from its boot
    // loop, the slot writes `state.sources.famousMeta`, and the merge
    // republishes with famous folded in.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    vi.mocked(famousMetaFetcher).mockResolvedValueOnce({
      meta: [
        { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy', description: '', type: '' },
        { id: 'm33', names: ['M33'], description: '', type: '' },
      ],
    } as never);

    const state = makeState();
    state.sources.catalogs.set(Source.Famous, {
      count: 2,
      positions: new Float32Array([0.78, 0.1, 0.2, 0.85, 0.05, 0.15]),
      diameterKpc: new Float32Array([67, 30]),
    } as never);
    const deps = makeDeps();
    const received: Array<readonly PointOfInterest[]> = [];
    state.subsystems.pois.setPois = (pois) => {
      received.push(pois);
    };
    await wireSlots(state, deps);
    // Let the famous-meta companion's async fetch + subscriber settle so
    // the republish lands before we assert on the final list.
    await new Promise((r) => setTimeout(r, 0));
    // The merge republishes whenever a group arrives; the LAST call holds
    // the fully-merged list once the famous-meta companion has resolved.
    const final = received[received.length - 1] ?? [];
    const ids = final.map((p) => p.id);
    expect(ids).toContain('famous-m31');
    expect(ids).toContain('famous-m33');
    expect(ids.some((id) => id.startsWith('cluster-'))).toBe(true);
    const m31 = final.find((p) => p.id === 'famous-m31');
    expect(m31?.name).toBe('Andromeda Galaxy');
    expect(m31?.category).toBe('famousGalaxy');
    // minApparentSizePx lives on the famousGalaxy arm — narrow before
    // reading it.
    const minPx = m31 && m31.category === 'famousGalaxy' ? m31.minApparentSizePx : undefined;
    expect(minPx).toBe(6);
  });

  it('merging famous then bulk clusters keeps both groups present', async () => {
    // The three-group merge must never let the famous wire clobber the
    // bulk-cluster wire (or vice versa): the final published list has to
    // carry static anchors + famous + bulk simultaneously.  Both async
    // groups arrive via their own slot — the famous-meta companion and
    // the cluster-catalog boot load — so we drive them through the
    // (mocked) fetchers rather than pre-seeding `state.sources`.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    vi.mocked(famousMetaFetcher).mockResolvedValueOnce({
      meta: [
        { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy', description: '', type: '' },
      ],
    } as never);
    // The cluster-catalog slot's boot load resolves with one cluster + one
    // supercluster; the slot subscriber writes `state.sources.clusterBulk`.
    vi.mocked(clusterCatalogFetcher).mockResolvedValueOnce({
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

    const state = makeState();
    state.sources.catalogs.set(Source.Famous, {
      count: 1,
      positions: new Float32Array([0.78, 0.1, 0.2]),
      diameterKpc: new Float32Array([67]),
    } as never);

    const deps = makeDeps();
    const received: Array<readonly PointOfInterest[]> = [];
    state.subsystems.pois.setPois = (pois) => {
      received.push(pois);
    };
    await wireSlots(state, deps);
    // Let both async slot fetches + their subscribers settle.
    await new Promise((r) => setTimeout(r, 0));

    const final = received[received.length - 1] ?? [];
    const ids = final.map((p) => p.id);
    // All three groups present in the final published list.
    expect(ids.some((id) => id.startsWith('cluster-') && !id.includes('-bulk-'))).toBe(true);
    expect(ids).toContain('famous-m31');
    expect(ids).toContain('cluster-bulk-coma');
    expect(ids).toContain('supercluster-bulk-shapley');
  });

  it('emits per-category structure counts that grow when the bulk catalog lands', async () => {
    // The Structures panel reads these counts to annotate its toggles.
    // rebuildAllPois fires onStructureCountsChange on every merge: once at
    // boot (static anchors only) and again when the bulk .ccat resolves.
    // Asserting the DELTA (one extra cluster + one extra SC, voids
    // unchanged) keeps the test robust to seed-anchor count changes.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    vi.mocked(clusterCatalogFetcher).mockResolvedValueOnce({
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

    const state = makeState();
    const deps = makeDeps();
    const counts: Array<Partial<Record<string, number>>> = [];
    (deps.cb.sources as { onStructureCountsChange?: (c: Record<string, number>) => void })
      .onStructureCountsChange = (c) => {
      counts.push(c);
    };
    await wireSlots(state, deps);
    await new Promise((r) => setTimeout(r, 0));

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
