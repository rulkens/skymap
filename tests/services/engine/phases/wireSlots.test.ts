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
import type { EngineCallbacks, EngineState } from '../../../../src/@types';
import type { BootstrapDeps } from '../../../../src/services/engine/phases/bootstrap';
import type { AssetSlot, LoadState } from '../../../../src/services/loading/types';

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
  famousMetaFetcher: vi.fn(async () => ({ meta: [], xrefs: {} })),
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

// Thumbnail subsystem: replace with a hollow factory so wireSlots's
// `bindToRenderers` call has somewhere to land.  We don't assert on
// it here — the destroy-reachability test in the sibling file
// covers thumbnail-renderer lifecycle.
vi.mock('../../../../src/services/engine/subsystems/thumbnailSubsystem', () => ({
  createThumbnailSubsystem: vi.fn(() => ({
    bindToRenderers: vi.fn(),
    destroy: vi.fn(),
  })),
}));

// Load-progress emitter: keep the real factory (so the slot registry
// gets walked) but spy on it so we can assert the Map size at the
// moment wireSlots hands the registry off.
const emitterSpy = vi.fn();
vi.mock('../../../../src/services/engine/subsystems/loadProgressAggregator', () => ({
  createLoadProgressEmitter: vi.fn((emit: unknown, slots: ReadonlyMap<string, unknown>) => {
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
function makeState(overrides: Partial<{
  points: Map<Source, ReturnType<typeof makeFakeSlot>>;
}> = {}): EngineState {
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
      clouds: new Map(),
      visibleMask: 0xff,
      lodMode: 'auto',
      famousMeta: [],
      famousXrefs: {},
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
      thumbnailRenderer: {} as never,
      diskRenderer: {} as never,
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
      thumbnails: null,
      loadProgress: null,
    } as never,
    cam: null,
    initialCamSnapshot: null,
    assetSlots: {
      points: points as Map<Source, never>,
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
    sources: { onCloudReady: vi.fn(), onLoadProgress: vi.fn() } as never,
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
      thumbnailRenderer: {} as never,
      diskRenderer: {} as never,
      proceduralDiskRenderer: {} as never,
      milkyWayRenderer: {} as never,
      firstReadySource: null,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireSlots', () => {
  beforeEach(() => {
    emitterSpy.mockClear();
  });

  it('all-arrivals gate resolves once every survey slot fires `ready` — wireSlots resolves AND fires `loading` status', async () => {
    // The all-arrivals gate is the single hardest-to-test invariant in
    // wireSlots: it constructs a `Promise<void>` that resolves only
    // when each of SDSS, 2MRS, GLADE, Famous transitions to `ready` or
    // `error`.  If a future refactor swaps the gate for a different
    // counting scheme that miscounts, the symptom would be "wireSlots
    // hangs forever" — exactly what a vitest timeout exposes here.
    const sdssSlot = makeFakeSlot('sdss-points');
    const twoMrsSlot = makeFakeSlot('2mrs-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const famousSlot = makeFakeSlot('famous-points');
    const points = new Map<Source, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.Famous, famousSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    // `wireSlots` returns a promise that resolves only after every
    // per-source slot has transitioned.  We kick off the body, then
    // drive each slot through its terminal state, then await.
    const done = wireSlots(state, deps);

    // Synchronously fire `ready` on each slot — the all-arrivals gate's
    // subscriber bumps a counter to 4 and resolves.  Doing it after the
    // wireSlots call (rather than before) is essential: the
    // `slot.subscribe(...)` line in the gate has to have run.
    //
    // Microtask flush: subscribe wiring happens inside the
    // `new Promise(...)` executor, which itself runs synchronously
    // when wireSlots is invoked — so by the time control returns to
    // us, the subscribers are attached.  `fire()` then synchronously
    // dispatches to them.
    sdssSlot.fire(readyValue(1));
    twoMrsSlot.fire(readyValue(1));
    gladeSlot.fire(readyValue(1));
    famousSlot.fire(readyValue(1));

    await done;

    // Loading status fires synchronously, before the gate; we still
    // assert it as evidence that wireSlots reached the lifecycle
    // notify-loading line (it's the only `lifecycle.onStatusChange`
    // call wireSlots itself makes — the `ready` follow-up lives in
    // wireInput).
    expect(deps.cb.lifecycle?.onStatusChange).toHaveBeenCalledWith({ kind: 'loading' });

    // SDSS fired first with count > 0, so the phaseLocals carrier
    // records it as the framing seed for wireInput.
    expect(deps.phaseLocals!.firstReadySource).toBe(Source.SDSS);
  });

  it('synthetic-fallback path fires `load(...)` on the synthetic slot when every real survey errors', async () => {
    // The fallback condition is `!pointsAnyReady`, where
    // `pointsAnyReady` is set only by Source.SDSS / TwoMRS / Glade
    // transitioning to `ready` with `count > 0`.  Famous-only ready
    // does NOT count (Famous is curated; an all-Famous "success" still
    // leaves the user with no main scene — see wireSlots's inline
    // comment for the rationale).  This test drives every REAL survey
    // through `error`, lets Famous error too, and asserts that the
    // synthetic slot's `.load(...)` was invoked.
    const sdssSlot = makeFakeSlot('sdss-points');
    const twoMrsSlot = makeFakeSlot('2mrs-points');
    const gladeSlot = makeFakeSlot('glade-points');
    const famousSlot = makeFakeSlot('famous-points');
    const synthSlot = makeFakeSlot('synthetic-points');
    const points = new Map<Source, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.Famous, famousSlot],
      [Source.Synthetic, synthSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    const done = wireSlots(state, deps);

    // Every real survey errors; Famous errors too.  At this point the
    // all-arrivals gate resolves, `pointsAnyReady` is still false, so
    // wireSlots reaches the synthetic-fallback branch.
    sdssSlot.fire(errorValue('sdss boom'));
    twoMrsSlot.fire(errorValue('2mrs boom'));
    gladeSlot.fire(errorValue('glade boom'));
    famousSlot.fire(errorValue('famous boom'));

    // The fallback branch awaits a fresh subscription on the synthetic
    // slot AND fires `synthSlot.load(...)`.  We must drive the synth
    // slot through its terminal state too, or wireSlots will hang.
    //
    // Microtask gap: the `await allArrivalsPromise` resolves on the
    // next microtask, then the fallback branch attaches its
    // subscriber and calls `load`.  We yield to the microtask queue
    // before firing the synthetic terminal so the subscriber is
    // actually attached.
    await Promise.resolve();
    await Promise.resolve();
    synthSlot.fire(errorValue('synthetic boom'));

    await done;

    // The load-fallback contract: synthetic.load was called, with a
    // request carrying Source.Synthetic + the engine's current tier.
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
    const points = new Map<Source, ReturnType<typeof makeFakeSlot>>([
      [Source.SDSS, sdssSlot],
      [Source.TwoMRS, twoMrsSlot],
      [Source.Glade, gladeSlot],
      [Source.Famous, famousSlot],
    ]);
    const state = makeState({ points });
    const deps = makeDeps();

    const done = wireSlots(state, deps);

    // Drive the gate so wireSlots returns; we want to read the
    // registry the emitter spy captured during the `createLoadProgressEmitter`
    // call, which happens AFTER the slot mints but BEFORE the
    // all-arrivals gate `await`.  Either way is fine — emitterSpy
    // already captured the Map reference; we just need wireSlots to
    // resolve so we can inspect deps.allSlots after the call too.
    sdssSlot.fire(readyValue(1));
    twoMrsSlot.fire(readyValue(1));
    gladeSlot.fire(readyValue(1));
    famousSlot.fire(readyValue(1));
    await done;

    // The emitter was constructed exactly once and the registry it
    // received is the same Map instance as `deps.allSlots`.  This is
    // the contract `wireSlots.ts`'s docblock calls out explicitly —
    // the loading bar and the dev panel MUST share a registry.
    expect(emitterSpy).toHaveBeenCalledTimes(1);
    const capturedRegistry = emitterSpy.mock.calls[0]![0] as Map<string, unknown>;
    expect(capturedRegistry).toBe(deps.allSlots);

    // The registry includes the per-source point slots (by their
    // `.name`) plus the three sidecar slots wireSlots itself mints
    // (filaments, famous-meta, pgc-aliases).  The CF-4 and synthetic
    // entries are gated on `volumesGateOpen` — true in vitest's
    // dev-build context, so we expect them too.  We assert "superset"
    // rather than exact equality so an additive change (a new slot)
    // doesn't break the test for the wrong reason.
    const names = new Set(capturedRegistry.keys());
    expect(names.has('sdss-points')).toBe(true);
    expect(names.has('2mrs-points')).toBe(true);
    expect(names.has('glade-points')).toBe(true);
    expect(names.has('famous-points')).toBe(true);
    expect(names.has('filaments')).toBe(true);
    expect(names.has('famous-meta')).toBe(true);
    expect(names.has('pgc-aliases')).toBe(true);
  });
});
