/**
 * tierSaga — integration tests over a real store + saga middleware.
 *
 * Rather than driving the generator by hand (which couples the test to the
 * exact effect sequence), these tests run the watcher inside an actual store
 * wired with `redux-saga`, dispatch the `requestTier` command, and assert on
 * the observable store outcome: the tier write, the Milky-Way re-seed, the
 * hover clear and the re-anchored selection. That keeps the tests honest about
 * the command/write split and the same-tier no-op without freezing the saga's
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
 * `requestTier`, then simulates the new cloud arriving via the count pulse.
 * The `resolveDeps` closure is mutable: before the swap the cloud holds
 * objID at index 0; after the swap the new cloud has the same objID at index 3.
 * Asserting `select.index === 3` after the count pulse proves the saga re-anchored
 * via the durable id rather than preserving the stale positional index.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchTierSaga } from '../../../src/state/tier/watchTierSaga';
import { engineSourceCountReported } from '../../../src/state/engine/engineSlice';
import { requestTier } from '../../../src/state/tier/requestTier';
import { selectTier } from '../../../src/state/tier/selectors';
import {
  updateSelectionSelect,
  updateSelectionFocus,
  updateSelectionHover,
} from '../../../src/state/selection/selectionSlice';
import { selectionRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import { MILKY_WAY_STARS_PER_TIER } from '../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { galaxyCatalogSelectionRow } from '../../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import type { GalaxyRowFixture } from '../../support/selectionResolverOver';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// No source selected: the re-anchor capture skips both slots without ever
// dereferencing this — the default for tests that never seed a galaxy ref.
/** The galaxyCatalog Layer's slice with nothing loaded — the default for the
 * cases that never seed a galaxy ref. */
const NO_GALAXIES = { catalogs: new Map(), famousMeta: [] } as unknown as GalaxyRowFixture;

const EMPTY_DEPS: ResolveDeps = {
  structures: { byId: () => null, byCategory: () => [] },
  stars: { current: () => null },
};

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

  function buildStore(
    resolveDeps: () => ResolveDeps = () => EMPTY_DEPS,
    galaxies: GalaxyRowFixture = NO_GALAXIES,
  ) {
    const sagaMiddleware = createSagaMiddleware();
    const built = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    sagaMiddleware.run(watchTierSaga);
    sagaMiddleware.setContext({
      selection: composeSelectionRows(
        () => [...coreSelectionRows(resolveDeps), galaxyCatalogSelectionRow(galaxies)],
        () => ALL_KINDS_ENABLED,
      ),
    });
    return built;
  }

  beforeEach(() => {
    store = buildStore();
  });

  it('turns the request command into the tier write', async () => {
    store.dispatch(requestTier('large'));
    await flush();

    expect(selectTier(store.getState())).toBe('large');
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
    // Hover is the observable of the worker having run: the saga clears it
    // unconditionally on a real swap, so a surviving hover proves the
    // `prev === payload` guard returned before any of the swap duties.
    const hover = { type: 'galaxyCatalog' as const, source: Source.SDSS, index: 0 };
    store.dispatch(updateSelectionHover(hover));

    store.dispatch(requestTier('large')); // already 'large'
    await flush();

    expect(store.getState()[selectionRoute].hover).toEqual(hover);
    expect(selectTier(store.getState())).toBe('large');
  });

  // ─── Re-anchor tests ──────────────────────────────────────────────────────────

  it('clears the select ref when the galaxy is absent from the new cloud (miss)', async () => {
    // Before the swap: cloud has objID 99n at index 0.
    // After the swap:  new cloud does NOT contain objID 99n (miss → clear).
    const SDSS_OBJ_ID = 99n;
    let currentCloud = makeCloud(SDSS_OBJ_ID, 0, 1);

    const resolveDeps = (): ResolveDeps => ({
      structures: { byId: () => null, byCategory: () => [] },
      stars: { current: () => null },
    });
    // The galaxyCatalog Layer's slice, read LIVE: the tier swap replaces the
    // cloud in place and the re-anchor must resolve against the NEW one.
    const galaxies = {
      get catalogs() {
        return new Map([[Source.SDSS, currentCloud]]);
      },
      famousMeta: [],
    } as unknown as GalaxyRowFixture;

    store = buildStore(resolveDeps, galaxies);
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));

    store.dispatch(requestTier('large'));
    await flush();

    // New cloud: objID 99n is absent — a cloud with a different objID.
    currentCloud = makeCloud(1n, 0, 1);
    store.dispatch(engineSourceCountReported({ source: Source.SDSS, count: 1 }));
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
      structures: { byId: () => null, byCategory: () => [] },
      stars: { current: () => null },
    });
    // The galaxyCatalog Layer's slice, read LIVE: the tier swap replaces the
    // cloud in place and the re-anchor must resolve against the NEW one.
    const galaxies = {
      get catalogs() {
        return new Map([[Source.SDSS, currentCloud]]);
      },
      famousMeta: [],
    } as unknown as GalaxyRowFixture;

    store = buildStore(resolveDeps, galaxies);
    // select → objID_A at old index 0; focus → objID_B at old index 1.
    store.dispatch(updateSelectionSelect({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 }));
    store.dispatch(updateSelectionFocus({ type: 'galaxyCatalog', source: Source.SDSS, index: 1 }));

    store.dispatch(requestTier('large'));
    await flush();

    // New cloud: objIDs swapped — A is now at index 1, B at index 0.
    currentCloud = buildCloud(objIDsNew);
    // The saga awaits two count pulses (one per captured slot × same source).
    // Dispatch twice: the saga's for-loop takes one event per re-anchor.
    store.dispatch(engineSourceCountReported({ source: Source.SDSS, count: 1 }));
    await flush();
    store.dispatch(engineSourceCountReported({ source: Source.SDSS, count: 1 }));
    await flush();

    const state = store.getState()[selectionRoute];
    // select was objID_A (old index 0) → new index 1.
    expect(state.select).toEqual({ type: 'galaxyCatalog', source: Source.SDSS, index: 1 });
    // focus was objID_B (old index 1) → new index 0.
    expect(state.focus).toEqual({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 });
  });

  it('clears hover unconditionally across the swap', async () => {
    // hover is cleared by the saga across the swap, regardless of whether the
    // hovered source reloads or not.
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

    // No count pulse needed — structure refs don't need re-anchoring.
    expect(store.getState()[selectionRoute].select).toEqual(structureRef);
  });
});
