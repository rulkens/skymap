/**
 * createSyntheticFallback — unit tests for the synthetic-survey fallback gate.
 *
 * The gate is intentionally imperative (not a pure demand predicate) because it
 * must see each survey's loaded `count` — a survey that resolves `ready` with
 * zero galaxies is NOT a success. These tests pin that count-aware policy plus
 * the hidden-at-boot shortcut, asserting the observable contract: the
 * `'syntheticFallback'` request flag is armed (which `reevaluateDemand` then
 * turns into the synthetic slot's `load`), and per-survey `ready` arrivals echo
 * `onStatusChange`.
 *
 * The flag is the seam: `createSyntheticFallback` arms it and calls the REAL
 * `reevaluateDemand`, whose Synthetic row demands `ctx.request('syntheticFallback')`
 * — so a successful arm is observable both as the flag on the request set AND
 * as a `load` call on the synthetic slot.
 */

import { describe, it, expect, vi } from 'vitest';
import { createSyntheticFallback } from '../../../../src/services/engine/wiring/createSyntheticFallback';
import { Source } from '../../../../src/data/sources';
import { maskWith } from '../../../../src/utils/sourceMask';
import { SURVEY_POINT_SOURCES } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
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
  onStatusChange: ReturnType<typeof vi.fn>;
  cb: EngineCallbacks;
};

/**
 * Build a minimal engine state with a stub slot per tier-fetched source plus
 * Synthetic. `drawMask` defaults to every survey visible (so none is treated
 * as hidden-at-boot). `settings` is a benign partial — `reevaluateDemand`
 * guards each row, so any predicate that touches an absent leaf is contained.
 */
function makeState(opts: { drawMask?: number } = {}): MakeStateResult {
  // Every survey + Famous + Synthetic visible by default.
  const everyVisible = [
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    Source.Milliquas,
    Source.FamousGalaxy,
  ].reduce((m, s) => maskWith(m, s), 0);
  const drawMask = opts.drawMask ?? everyVisible;

  const slots = new Map<SourceType, StubSlot>();
  for (const src of [
    Source.SDSS,
    Source.TwoMRS,
    Source.Glade,
    Source.Milliquas,
    Source.FamousGalaxy,
    Source.Synthetic,
  ]) {
    slots.set(src, stubSlot());
  }

  const onStatusChange = vi.fn();
  const cb = { lifecycle: { onStatusChange } } as unknown as EngineCallbacks;

  const state = {
    settings: {} as never,
    sources: { drawMask, tier: 'medium' },
    requests: new Set<string>(),
    gpu: { renderer: { totalCount: () => 42 } },
    assetSlots: {
      points: slots as unknown as Map<SourceType, AssetSlot<unknown, unknown>>,
    },
  } as unknown as EngineState;

  return { state, slots, onStatusChange, cb };
}

/** Drive every real survey slot through a final state (ready/error). */
function settleSurveys(
  slots: Map<SourceType, StubSlot>,
  driver: (src: SourceType) => LoadState<GalaxyCatalog>,
): void {
  for (const src of SURVEY_POINT_SOURCES) slots.get(src)?.emit(driver(src));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createSyntheticFallback', () => {
  it('arms synthetic fallback (sets the flag) when every real survey settles in error', () => {
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    settleSurveys(slots, () => errored());

    expect(state.requests.has('syntheticFallback')).toBe(true);
    // The seam closes: reevaluateDemand saw the flag and loaded the synthetic slot.
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('does not arm when any real survey succeeds (ready count>0)', () => {
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    // SDSS lands with data; the rest fail.
    slots.get(Source.SDSS)?.emit(ready(100));
    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());

    expect(state.requests.has('syntheticFallback')).toBe(false);
    expect(slots.get(Source.Synthetic)?.load).not.toHaveBeenCalled();
    // Each settled survey subscriber self-unsubscribed (the once-only
    // counted/unsub guard) — no listener leak.
    for (const src of SURVEY_POINT_SOURCES) {
      expect(slots.get(src)?.liveListeners()).toBe(0);
    }
  });

  it('arms when a real survey is ready but EMPTY (count 0) and the rest error', () => {
    // The empty-ready edge: a survey ready with count===0 is NOT a success, so
    // the fallback must still arm. This is the case a pure ctx predicate (which
    // sees only the 'ready' discriminant, not the count) could not capture.
    const { state, slots, cb } = makeState();
    createSyntheticFallback(state, cb);

    slots.get(Source.SDSS)?.emit(ready(0)); // ready but empty → not success
    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());

    expect(state.requests.has('syntheticFallback')).toBe(true);
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('counts a hidden-at-boot survey as already settled', () => {
    // Hide SDSS in the drawMask: its slot never transitions, but the gate must
    // not wait on it. Driving the OTHER three surveys to error then arms.
    const everyButSdss = [
      Source.TwoMRS,
      Source.Glade,
      Source.Milliquas,
      Source.FamousGalaxy,
    ].reduce((m, s) => maskWith(m, s), 0);
    const { state, slots, cb } = makeState({ drawMask: everyButSdss });
    createSyntheticFallback(state, cb);

    slots.get(Source.TwoMRS)?.emit(errored());
    slots.get(Source.Glade)?.emit(errored());
    slots.get(Source.Milliquas)?.emit(errored());
    // SDSS never emits — it was hidden at boot.

    expect(state.requests.has('syntheticFallback')).toBe(true);
    expect(slots.get(Source.Synthetic)?.load).toHaveBeenCalledTimes(1);
  });

  it('emits onStatusChange per real-survey ready arrival', () => {
    const { slots, onStatusChange, cb, state } = makeState();
    createSyntheticFallback(state, cb);

    slots.get(Source.Glade)?.emit(ready(7));

    expect(onStatusChange).toHaveBeenCalledWith({
      kind: 'ready',
      count: 42, // state.gpu.renderer.totalCount()
      source: Source.Glade,
    });
  });
});
