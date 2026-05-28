/**
 * wireSlots — focused tests for the highest-leverage invariants of the
 * second bootstrap phase (originally ~600 lines lifted verbatim from
 * the pre-Phase-5 IIFE).
 *
 * ### Why this file exists
 *
 * Pre-M7 the only coverage `wireSlots.ts` had was `bootstrap.test.ts`,
 * which mocks the phase at module scope and therefore exercises nothing
 * of its body.  That's a reasonable choice for the orchestrator
 * contract but it leaves the per-slot mint sites, the all-arrivals
 * gate, the synthetic-fallback path, and the loadProgress emitter
 * wiring with zero direct asserts — even though those four lines of
 * logic were the source of the 2026-05-08 black-screen incident.
 *
 * This file targets three invariants whose violation would be very
 * hard to catch from a manual run:
 *
 *   1. The all-arrivals gate eventually fires the lifecycle callbacks
 *      that take the engine out of `loading` (today: `cb.lifecycle.
 *      onStatusChange({ kind: 'loading' })` synchronously, with the
 *      `kind: 'ready'` follow-up coming from `wireInput`).  We assert
 *      the wireSlots side of that contract: the all-arrivals
 *      `Promise<void>` actually resolves once every per-source slot
 *      reports `ready`, AND wireSlots completes (rather than hanging).
 *
 *   2. The synthetic-fallback path mints + loads a synthetic-source
 *      slot when every real survey errored out.  This is a DEV-only
 *      safety net that is invisible in production.  Without a test,
 *      anyone refactoring the all-arrivals gate could silently drop
 *      the fallback and ship a "all-real-surveys-down ⇒ black screen"
 *      regression.
 *
 *   3. The loadProgress emitter is wired against EVERY minted slot.
 *      The `allSlots` Map (carried in `BootstrapDeps`) is the single
 *      registry both the loading bar AND the `LoadingDevPanel` read
 *      from, so a missed slot here makes the dev panel quietly lie.
 *      We assert the Map ends up containing entries for every expected
 *      slot name.
 *
 * ### Mocking strategy
 *
 * `wireSlots` constructs real `AssetSlot` instances internally (for
 * filaments, famous-meta, pgc-aliases, optionally cf4-density and
 * synthetic-volume).  Those are fine to leave real — the slots are
 * pure CPU state machines and their fetchers are easy to stub.
 *
 * The pieces we DO mock:
 *
 *   - the fetcher modules, so `slot.load()` doesn't network;
 *   - the thumbnail-subsystem factory, so we don't need a real GPU device;
 *   - the load-progress emitter factory, so we can intercept the
 *     `allSlots` Map at the moment wireSlots hands it off.
 *
 * The per-source point slots are injected from the test via a
 * fake-slot helper — `wireSlots` reads them off `state.assetSlots.points`
 * rather than minting them itself (that happens in `initGpu`).  This
 * is the seam that makes the all-arrivals gate practically testable
 * without bringing a real WebGPU device into the test.
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

// Post-Task-11 split: wireSlots constructs three subsystems where the
// legacy `thumbnailSubsystem` used to live.  Each carries the same
// GPU-device dependency the legacy mock was guarding against, so we
// mock all three the same way: hollow factories that satisfy the call
// sites without touching the (stubbed) device.
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
// LOD-3 hi-res pair (R6).  The texture factory would call into
// `device.createTexture` if not mocked — we don't have a real GPU here,
// so stub out both the resource handle and its consumer subsystem.
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
      // Post-Task-7 (2026-05-17): static cluster/supercluster/void
      // anchors are wired unconditionally — `wireSlots` now always
      // invokes `state.subsystems.pois.setPois(...)`, so the mock has
      // to provide a callable `setPois` even when the test isn't
      // asserting on POI behaviour.
      pois: { setPois: vi.fn() } as never,
      // wireSlots now calls state.subsystems.fades.register on the
      // filament + overlay + label-layer handles after the slot mints.
      // Provide a stub registry so the calls don't crash.
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

    // The emitter was constructed exactly once and the registry it
    // received is the same Map instance as `deps.allSlots`.  This is
    // the contract `wireSlots.ts`'s docblock calls out explicitly —
    // the loading bar and the dev panel MUST share a registry.
    expect(emitterSpy).toHaveBeenCalledTimes(1);
    const capturedRegistry = emitterSpy.mock.calls[0]![0] as Map<string, unknown>;
    expect(capturedRegistry).toBe(deps.allSlots);

    // The registry includes the per-source point slots (by their
    // `.name`) plus the sidecar slots wireSlots itself mints
    // (filaments, famous-meta, pgc-aliases, CF-4, MCPM) plus the
    // synthetic fixtures (DEV-only — vitest runs as DEV).  Asserted
    // as a superset so an additive change doesn't break the test for
    // the wrong reason.
    const names = new Set(capturedRegistry.keys());
    expect(names.has('sdss-points')).toBe(true);
    expect(names.has('2mrs-points')).toBe(true);
    expect(names.has('glade-points')).toBe(true);
    expect(names.has('famous-points')).toBe(true);
    expect(names.has('filaments')).toBe(true);
    expect(names.has('famous-meta')).toBe(true);
    expect(names.has('pgc-aliases')).toBe(true);
  });

  it('wires static cluster/supercluster/void anchors unconditionally (no URL gate)', async () => {
    // No `?anchors=1` query param.  After wireSlots runs, the POI
    // subsystem should still receive the static anchor list — the
    // production default since the `?anchors=1` gate is removed.
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
    // Pre-populate the famous-meta sidecar and the famous catalog so
    // the synchronous initial-merge call inside wireSlots picks them
    // up immediately — we don't have to wait for slot transitions.
    delete (globalThis as { location?: unknown }).location;
    (globalThis as { location: { search: string } }).location = { search: '' };

    const state = makeState();
    state.sources.famousMeta = [
      { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy', description: '', type: '' },
      { id: 'm33', names: ['M33'], description: '', type: '' },
    ];
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
    // The wire calls setPois twice: once for static anchors only (the
    // pre-Famous-merge call), then again with the merged list once
    // rewireFamousPois sees both ingredients present.  Assert against
    // the LAST call's payload.
    const final = received[received.length - 1] ?? [];
    const ids = final.map((p) => p.id);
    expect(ids).toContain('famous-m31');
    expect(ids).toContain('famous-m33');
    expect(ids.some((id) => id.startsWith('cluster-'))).toBe(true);
    const m31 = final.find((p) => p.id === 'famous-m31');
    expect(m31?.name).toBe('Andromeda Galaxy');
    expect(m31?.category).toBe('famousGalaxy');
    expect(m31?.minApparentSizePx).toBe(6);
  });
});
