/**
 * tierSaga — integration tests over a real store + saga middleware.
 *
 * Rather than driving the generator by hand (which couples the test to the
 * exact effect sequence), these tests run the watcher inside an actual store
 * wired with `redux-saga`, dispatch the `requestTier` command, and assert on
 * the observable outcome: the store's tier and whether the injected
 * `runTierTransition` runner fired. That keeps the tests honest about the
 * command/write split and the same-tier no-op without freezing the saga's
 * internal steps.
 *
 * Each test builds a FRESH store, because `takeLatest` carries per-store
 * worker state and the same-tier no-op test depends on the watcher's prior view
 * of the current tier. A flushed macrotask (`setTimeout(…, 0)`) after each
 * dispatch lets the `takeLatest` worker run to completion — a bare
 * `Promise.resolve()` microtask is not enough, since the saga schedules its
 * continuation on a macrotask.
 *
 * ### Re-anchor tests
 *
 * The re-anchor suite seeds a galaxy select/focus ref BEFORE dispatching
 * `requestTier`, then simulates the new cloud arriving via `catalogLoaded`.
 * The `resolveDeps` closure is mutable: before the swap the cloud holds
 * objID at index 0; after the swap the new cloud has the same objID at index 3.
 * Asserting `select.index === 3` after `catalogLoaded` proves the saga re-anchored
 * via the durable id rather than preserving the stale positional index.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTierSaga } from '../../../src/state/tier/watchTierSaga';
import { requestTier } from '../../../src/state/tier/requestTier';
import { selectTier } from '../../../src/state/tier/selectors';
import {
  updateSelectionSelect,
  updateSelectionFocus,
} from '../../../src/state/selection/selectionSlice';
import { catalogLoaded } from '../../../src/state/catalog/catalogLoaded';
import { selectionRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import { MILKY_WAY_STARS_PER_TIER } from '../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { RunTierTransition } from '../../../src/store/types';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ─── Cloud fixture ─────────────────────────────────────────────────────────────

/** Minimal GalaxyCatalog placing `objId` at a given `index` (with `count` rows). */
function makeCloud(objId: bigint, index: number, count: number): GalaxyCatalog {
  const objIDs = new BigUint64Array(count);
  objIDs[index] = objId;
  return makeGalaxyCatalog(count, {
    positions: new Float32Array(count * 3).fill(1),
    spectroscopicZ: new Float32Array(count).fill(0.01),
    magU: new Float32Array(count).fill(18),
    magG: new Float32Array(count).fill(17),
    magR: new Float32Array(count).fill(16),
    magI: new Float32Array(count).fill(16),
    magZ: new Float32Array(count).fill(16),
    objIDs,
    diameterKpc: new Float32Array(count).fill(30),
    axisRatio: new Float32Array(count).fill(1),
  });
}

// ─── Store builder ─────────────────────────────────────────────────────────────

describe('watchTierSaga', () => {
  let store: ReturnType<typeof buildStore>;
  let runner: ReturnType<typeof vi.fn<RunTierTransition>>;

  function buildStore(resolveDeps?: () => ResolveDeps) {
    const sagaMiddleware = createSagaMiddleware();
    const built = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    sagaMiddleware.run(watchTierSaga);
    runner = vi.fn<RunTierTransition>();
    sagaMiddleware.setContext({ runTierTransition: runner });
    if (resolveDeps) sagaMiddleware.setContext({ resolveDeps });
    return built;
  }

  beforeEach(() => {
    store = buildStore();
  });

  it('writes the new tier and runs the transition once', async () => {
    store.dispatch(requestTier('large'));
    await flush();

    expect(selectTier(store.getState())).toBe('large');
    expect(runner).toHaveBeenCalledTimes(1);
    // 'medium' is the boot default the tier slice seeds; the runner sees the
    // PREVIOUS tier first so its per-source diff stays honest.
    expect(runner).toHaveBeenCalledWith('medium', 'large');
  });

  it('re-seeds the Milky-Way star count from the new tier budget', async () => {
    // settings.milkyWay.starCount is an absolute count with no built-in tie to
    // the tier — this saga's re-seed is what keeps it meaningful across a
    // tier change. Assert the END state only, after `flush()`: redux-saga
    // queues nested `put`s, so this saga's own setTier/setMilkyWayTuning pair
    // is not guaranteed to land in source order relative to other watchers
    // reacting to `setTier` — but both are guaranteed to have landed by the
    // time the dispatched worker has run to completion.
    store.dispatch(requestTier('large'));
    await flush();

    expect(store.getState().settings.milkyWay.starCount).toBe(MILKY_WAY_STARS_PER_TIER.large);
  });

  it('is a no-op for a same-tier request', async () => {
    store.dispatch(requestTier('large'));
    await flush();
    runner.mockClear();

    store.dispatch(requestTier('large')); // already 'large'
    await flush();

    expect(runner).not.toHaveBeenCalled();
    expect(selectTier(store.getState())).toBe('large');
  });

  // ─── Re-anchor tests ──────────────────────────────────────────────────────────

  it('re-anchors a galaxy select ref across a tier swap by durable id', async () => {
    // Before the swap: SDSS cloud has objID 42n at index 0.
    // After the swap:  SDSS cloud has objID 42n at index 3 (tier changed the slice).
    // The saga must re-anchor the select ref from index 0 → index 3.
    const SDSS_OBJ_ID = 42n;
    let currentCloud = makeCloud(SDSS_OBJ_ID, 0, 4);

    const resolveDeps = (): ResolveDeps => ({
      catalogs: { get: (src) => (src === Source.SDSS ? currentCloud : undefined) },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    });

    store = buildStore(resolveDeps);
    // Seed a galaxy select ref BEFORE the swap (index 0 in the old cloud).
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));

    // Dispatch the tier change (medium → large; SDSS reloads on this swap because
    // tierTarget(medium) = 156_000 but tierTarget(large) = undefined).
    store.dispatch(requestTier('large'));
    await flush();

    // The select ref should still be pending (re-anchor waits for catalogLoaded).
    // Simulate the new cloud arriving: objID 42n is now at index 3.
    currentCloud = makeCloud(SDSS_OBJ_ID, 3, 4);
    store.dispatch(catalogLoaded({ source: Source.SDSS }));
    await flush();

    const selectRef = store.getState()[selectionRoute].select;
    expect(selectRef).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 3, // re-anchored to the new position
    });
  });

  it('clears the select ref when the galaxy is absent from the new cloud (miss)', async () => {
    // Before the swap: cloud has objID 99n at index 0.
    // After the swap:  new cloud does NOT contain objID 99n (miss → clear).
    const SDSS_OBJ_ID = 99n;
    let currentCloud = makeCloud(SDSS_OBJ_ID, 0, 1);

    const resolveDeps = (): ResolveDeps => ({
      catalogs: { get: (src) => (src === Source.SDSS ? currentCloud : undefined) },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    });

    store = buildStore(resolveDeps);
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));

    store.dispatch(requestTier('large'));
    await flush();

    // New cloud: objID 99n is absent — a cloud with a different objID.
    currentCloud = makeCloud(1n, 0, 1);
    store.dispatch(catalogLoaded({ source: Source.SDSS }));
    await flush();

    const selectRef = store.getState()[selectionRoute].select;
    // Miss: resolveFocusId returns null → slot cleared.
    expect(selectRef).toBeNull();
  });

  it('re-anchors both select and focus refs independently', async () => {
    const SDSS_OBJ_ID_A = 111n;
    const SDSS_OBJ_ID_B = 222n;
    // Place both objIDs in the old cloud at indices 0 and 1.
    let objIDsOld = new BigUint64Array([SDSS_OBJ_ID_A, SDSS_OBJ_ID_B]);
    let objIDsNew = new BigUint64Array([SDSS_OBJ_ID_B, SDSS_OBJ_ID_A]); // swapped

    function buildCloud(objIDs: BigUint64Array): GalaxyCatalog {
      const count = objIDs.length;
      return makeGalaxyCatalog(count, {
        positions: new Float32Array(count * 3).fill(1),
        spectroscopicZ: new Float32Array(count).fill(0.01),
        magU: new Float32Array(count).fill(18),
        magG: new Float32Array(count).fill(17),
        magR: new Float32Array(count).fill(16),
        magI: new Float32Array(count).fill(16),
        magZ: new Float32Array(count).fill(16),
        objIDs,
        diameterKpc: new Float32Array(count).fill(30),
        axisRatio: new Float32Array(count).fill(1),
      });
    }

    let currentCloud = buildCloud(objIDsOld);
    const resolveDeps = (): ResolveDeps => ({
      catalogs: { get: (src) => (src === Source.SDSS ? currentCloud : undefined) },
      famousGalaxiesMeta: [],
      structures: { byId: () => null },
      stars: { current: () => null },
    });

    store = buildStore(resolveDeps);
    // select → objID_A at old index 0; focus → objID_B at old index 1.
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));
    store.dispatch(updateSelectionFocus({ type: 'galaxyCatalog', source: Source.SDSS, index: 1 }));

    store.dispatch(requestTier('large'));
    await flush();

    // New cloud: objIDs swapped — A is now at index 1, B at index 0.
    currentCloud = buildCloud(objIDsNew);
    // The saga awaits two catalogLoaded events (one per captured slot × same source).
    // Dispatch twice: the saga's for-loop takes one event per re-anchor.
    store.dispatch(catalogLoaded({ source: Source.SDSS }));
    await flush();
    store.dispatch(catalogLoaded({ source: Source.SDSS }));
    await flush();

    const state = store.getState()[selectionRoute];
    // select was objID_A (old index 0) → new index 1.
    expect(state.select).toEqual({ type: 'galaxyCatalog', source: Source.SDSS, index: 1 });
    // focus was objID_B (old index 1) → new index 0.
    expect(state.focus).toEqual({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 });
  });

  it('clears hover unconditionally across the swap', async () => {
    // hover is cleared by the saga before the transition, regardless of whether
    // the hovered source reloads or not.
    const { updateSelectionHover } = await import('../../../src/state/selection/selectionSlice');

    store = buildStore();
    store.dispatch(updateSelectionHover({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));

    store.dispatch(requestTier('large'));
    await flush();

    expect(store.getState()[selectionRoute].hover).toBeNull();
  });

  it('does NOT re-anchor tier-agnostic sources (structure ref survives unchanged)', async () => {
    // Structure refs are durable — they survive the swap with no action needed.
    store = buildStore();
    const structureRef = { type: 'structure' as const, id: 'cluster-virgo' };
    store.dispatch(updateSelectionSelect(structureRef));

    store.dispatch(requestTier('large'));
    await flush();

    // No catalogLoaded needed — structure refs don't need re-anchoring.
    expect(store.getState()[selectionRoute].select).toEqual(structureRef);
  });
});
