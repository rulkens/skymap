/**
 * createSyntheticFallback — unit tests for the synthetic-galaxy catalog fallback gate.
 *
 * The gate is intentionally imperative (not a pure demand predicate) because it
 * must see each galaxy catalog's loaded `count` — a galaxy catalog that resolves `ready` with
 * zero galaxies is NOT a success. These tests pin that count-aware policy plus
 * the hidden-at-boot shortcut, asserting the observable contract: the
 * `'syntheticFallback'` request flag is armed (which `reevaluateDemand` then
 * turns into the synthetic slot's `load`), and per-galaxy-catalog `ready` arrivals echo
 * `onStatusChange`.
 *
 * The flag is the seam: `createSyntheticFallback` arms it and calls the REAL
 * `reevaluateDemand`, whose Synthetic row demands `ctx.request('syntheticFallback')`
 * — so a successful arm is observable both as the flag on the request set AND
 * as a `load` call on the synthetic slot.
 */

import { describe, it, expect, vi } from 'vitest';
import { createSyntheticFallback } from '../../../../src/services/engine/wiring/createSyntheticFallback';
import { createAppStore } from '../../../../src/store/createAppStore';
import { engineStatusChanged } from '../../../../src/state/engine/engineSlice';
import { Source } from '../../../../src/data/sources';
import { FormatVersionError } from '../../../../src/data/formatVersionError';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { GALAXY_CATALOG_POINT_SOURCES } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { PriorityQueue } from '../../../../src/utils/concurrency/priorityQueue';
import { ASSET_QUEUE_CONCURRENCY } from '../../../../src/utils/concurrency/assetQueueConcurrency';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// ── Stub slot ────────────────────────────────────────────────────────────────

type Listener = (s: LoadState<GalaxyCatalog>) => void;

type StubSlot = AssetSlot<GalaxyCatalog, unknown> & {
  /** Push a state to every live subscriber (simulates a slot transition). */
  emit: (s: LoadState<GalaxyCatalog>) => void;
  load: ReturnType<typeof vi.fn>;
  /** Count of currently-subscribed listeners (drops as subscribers unsub). */
  liveListeners: () => number;
};

/**
 * Stub slot whose `subscribe` records its listener (and removes it on unsub),
 * letting a test drive the slot through `ready` / `error` transitions and
 * verify the gate's once-only unsubscribe.
 */
function stubSlot(): StubSlot {
  const listeners = new Set<Listener>();
  const load = vi.fn();
  return {
    name: 'stub',
    load: load as unknown as StubSlot['load'],
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: (fn) => {
      listeners.add(fn as Listener);
      return () => listeners.delete(fn as Listener);
    },
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
    emit: (s) => {
      for (const fn of [...listeners]) fn(s);
    },
    liveListeners: () => listeners.size,
  };
}

/** A `ready` LoadState carrying a catalog of the given count. */
function ready(count: number): LoadState<GalaxyCatalog> {
  return {
    kind: 'ready',
    req: {},
    value: { count } as GalaxyCatalog,
    loadedAtMs: 0,
  };
}

/** A final `error` LoadState. */
function errored(): LoadState<GalaxyCatalog> {
  return { kind: 'error', req: {}, error: new Error('boom'), finalAttempt: 1 };
}

/** A final `error` LoadState wrapping an HttpError — an ordinary fetch
 * failure, distinct from `formatVersionErrored` below. */
function httpErrored(): LoadState<GalaxyCatalog> {
  return { kind: 'error', req: {}, error: new HttpError(500, '/data/sdss.bin'), finalAttempt: 1 };
}

/** A final `error` LoadState wrapping a FormatVersionError — the stale-.bin
 * case that must suppress the fallback rather than arm it. */
function formatVersionErrored(): LoadState<GalaxyCatalog> {
  return {
    kind: 'error',
    req: {},
    error: new FormatVersionError(
      'galaxy catalog',
      8,
      9,
      'unsupported version: 8 — please regenerate the .bin via "npm run build-tiers"',
    ),
    finalAttempt: 1,
  };
}

// ── State + callbacks builders ───────────────────────────────────────────────

type MakeStateResult = {
  state: EngineState;
  slots: Map<SourceType, StubSlot>;
  cb: EngineCallbacks;
};

/**
 * Build a minimal engine state with a stub slot per tier-fetched source plus
 * Synthetic. `disabledSources` lists the catalogs hidden at boot — the gate now
 * reads each catalog's `settings.galaxyCatalogs.items[id].enabled` INTENT (no
 * longer a draw mask) to decide hidden-at-boot, so a disabled source is treated
 * as pre-settled. Every catalog is enabled by default.
 */
function makeState(opts: { disabledSources?: readonly SourceType[] } = {}): MakeStateResult {
  const disabled = new Set(opts.disabledSources ?? []);

  // Per-catalog enabled intent, keyed by GalaxyCatalogId — the same record
  // shape `engine.ts` seeds and the production gate indexes.
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

  const slots = new Map<SourceType, StubSlot>();
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
    slots.set(src, stubSlot());
  }

  const cb = {
    store: createAppStore().store,
  } as unknown as EngineCallbacks;

  const state = {
    tier: 'medium',
    settings: { galaxyCatalogs: { items } } as never,
    requests: new Set<string>(),
    gpu: { galaxyPointRenderer: { totalCount: () => 42 } },
    assetSlots: {
      points: slots as unknown as Map<SourceType, AssetSlot<unknown, unknown>>,
      bodyTextures: new Map(),
    },
    // `reevaluateDemand` enqueues onto this instead of calling `slot.load()`.
    // The Synthetic row is the only one demanded in these cases (every real
    // catalog has settled in error, so none is idle), so it starts inside the
    // concurrency bound and its spy fires before the enqueue call returns.
    subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) },
    // Far from Earth — buildDemandCtx assembles the eye from pose + projection,
    // so both must be present; a far resting pose keeps the proximity-gated
    // body-texture rows out of the demand set.
    cameraRuntime: {
      lastPose: {
        current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
      },
      displayedPose: {
        current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: Infinity }),
      },
      projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 1e7 },
      lastRenderedSimDays: { current: CONST_J2000 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
  } as unknown as EngineState;

  return { state, slots, cb };
}

/** Drive every real galaxy catalog slot through a final state (ready/error). */
function settleGalaxyCatalogs(
  slots: Map<SourceType, StubSlot>,
  driver: (src: SourceType) => LoadState<GalaxyCatalog>,
): void {
  for (const src of GALAXY_CATALOG_POINT_SOURCES) slots.get(src)?.emit(driver(src));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createSyntheticFallback', () => {
  it('arms synthetic fallback (sets the flag) when every real galaxy catalog settles in error', async () => {
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    settleGalaxyCatalogs(slots, () => errored());

    expect(state.requests.has('syntheticFallback')).toBe(true);
    // The seam closes: reevaluateDemand saw the flag and ENQUEUED the synthetic
    // slot. The drain is what turns that into a `load()`: the earlier settle
    // passes ran while the real catalogs were still idle and enabled, so they
    // filled the queue's two slots with entries that only clear on a microtask
    // turn. Nothing in a synchronous test body gives them one.
    await state.subsystems.assetQueue.drain();
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('still arms when every real galaxy catalog fails with an ordinary HttpError', async () => {
    // Confirms the suppression added for FormatVersionError is type-specific,
    // not a blanket "any error present" check — an ordinary fetch failure
    // (HttpError) must still trip the backstop.
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    settleGalaxyCatalogs(slots, () => httpErrored());

    expect(state.requests.has('syntheticFallback')).toBe(true);
    await state.subsystems.assetQueue.drain();
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('does not arm when a real galaxy catalog settles with a FormatVersionError', async () => {
    // The regression this task exists to prevent: a stale-.bin version
    // mismatch must suppress the backstop rather than let the synthetic
    // cloud paper over "this build cannot read this data".
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    slots.get(Source.SDSS)?.emit(formatVersionErrored());
    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());
    slots.get(Source.DesiDeep)?.emit(errored());
    slots.get(Source.DesiWedge)?.emit(errored());
    slots.get(Source.DesiSgw)?.emit(errored());

    expect(state.requests.has('syntheticFallback')).toBe(false);
    await state.subsystems.assetQueue.drain();
    expect(slots.get(Source.Synthetic)?.load).not.toHaveBeenCalled();
  });

  it('does not arm when any real galaxy catalog succeeds (ready count>0)', () => {
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    // SDSS lands with data; the rest fail.
    slots.get(Source.SDSS)?.emit(ready(100));
    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());
    slots.get(Source.DesiDeep)?.emit(errored());
    slots.get(Source.DesiWedge)?.emit(errored());
    slots.get(Source.DesiSgw)?.emit(errored());

    expect(state.requests.has('syntheticFallback')).toBe(false);
    expect(slots.get(Source.Synthetic)?.load).not.toHaveBeenCalled();
    // Each settled galaxy catalog subscriber self-unsubscribed (the once-only
    // counted/unsub guard) — no listener leak.
    for (const src of GALAXY_CATALOG_POINT_SOURCES) {
      expect(slots.get(src)?.liveListeners()).toBe(0);
    }
  });

  it('arms when a real galaxy catalog is ready but EMPTY (count 0) and the rest error', async () => {
    // The empty-ready edge: a galaxy catalog ready with count===0 is NOT a success, so
    // the fallback must still arm. This is the case a pure ctx predicate (which
    // sees only the 'ready' discriminant, not the count) could not capture.
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    slots.get(Source.SDSS)?.emit(ready(0)); // ready but empty → not success
    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());
    slots.get(Source.DesiDeep)?.emit(errored());
    slots.get(Source.DesiWedge)?.emit(errored());
    slots.get(Source.DesiSgw)?.emit(errored());

    expect(state.requests.has('syntheticFallback')).toBe(true);
    // Drain for the same reason as the first case.
    await state.subsystems.assetQueue.drain();
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('counts a hidden-at-boot galaxy catalog as already settled', async () => {
    // Disable SDSS's enabled intent: its slot never transitions, but the gate
    // reads the enabled flag and must not wait on it. Driving the OTHER
    // galaxy catalogs to error then arms.
    const { state, slots, cb } = makeState({ disabledSources: [Source.SDSS] });
    createSyntheticFallback(state, cb);

    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());
    slots.get(Source.DesiDeep)?.emit(errored());
    slots.get(Source.DesiWedge)?.emit(errored());
    slots.get(Source.DesiSgw)?.emit(errored());
    // SDSS never emits — it was hidden at boot.

    expect(state.requests.has('syntheticFallback')).toBe(true);
    // Drain for the same reason as the first case.
    await state.subsystems.assetQueue.drain();
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('dispatches engineStatusChanged(ready) per real-galaxy catalog ready arrival', () => {
    const { slots, cb, state } = makeState();
    const dispatchSpy = vi.spyOn(cb.store, 'dispatch');
    createSyntheticFallback(state, cb);

    slots.get(Source.Glade)?.emit(ready(7));

    expect(dispatchSpy).toHaveBeenCalledWith(
      engineStatusChanged({
        kind: 'ready',
        count: 42, // state.gpu.galaxyPointRenderer.totalCount()
        source: Source.Glade,
      }),
    );
  });
});
