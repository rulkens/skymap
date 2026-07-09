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
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { GALAXY_CATALOG_POINT_SOURCES } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
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
    forceReload: () => {},
    cancel: () => {},
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
    gpu: { renderer: { totalCount: () => 42 } },
    assetSlots: {
      points: slots as unknown as Map<SourceType, AssetSlot<unknown, unknown>>,
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
  it('arms synthetic fallback (sets the flag) when every real galaxy catalog settles in error', () => {
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    settleGalaxyCatalogs(slots, () => errored());

    expect(state.requests.has('syntheticFallback')).toBe(true);
    // The seam closes: reevaluateDemand saw the flag and loaded the synthetic slot.
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
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

  it('arms when a real galaxy catalog is ready but EMPTY (count 0) and the rest error', () => {
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
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('counts a hidden-at-boot galaxy catalog as already settled', () => {
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
        count: 42, // state.gpu.renderer.totalCount()
        source: Source.Glade,
      }),
    );
  });
});
