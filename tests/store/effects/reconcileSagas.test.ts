/**
 * reconcileSagas tests — verifies that the four watcher sagas correctly call
 * ReconcileEffects closures in response to dispatched settings actions.
 *
 * Harness: a real RTK configureStore + redux-saga middleware with ReconcileEffects
 * spies injected via setContext before the watchers run. The store is built fresh
 * per test (beforeEach) to avoid cross-test spy bleed.
 *
 * The setFlow case is worth a note: FADE_ROW includes `[setFlow.type]: 'flow'`,
 * so watchFades fires syncFades(['flow']) for EVERY setFlow dispatch. watchFlowReseed
 * only fires reseedFlow when payload.mode or payload.count is defined. The test
 * below asserts BOTH effects on setFlow({count}) and only the fade on
 * setFlow({enabled:true}).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all } from 'typed-redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import {
  watchWake,
  watchFades,
  watchFlowReseed,
  watchBiasBake,
  FADE_ROW,
} from '../../../src/store/effects/reconcileSagas';
import {
  setMilkyWayEnabled,
  setGalaxyCatalogSize,
  writeVolumeField,
  setFlow,
  setBiasMode,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setFilamentsEnabled,
  setMilkyWayLabelEnabled,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  setVolumesEnabled,
} from '../../../src/state/settings/settingsSlice';
import { beginDrag, setAutoRotate } from '../../../src/state/camera/cameraSlice';
import { setTier } from '../../../src/state/tier/tierSlice';
import type { VisibilityLayerKey } from '../../../src/@types/animation/VisibilityLayerKey';
import type { BiasMode } from '../../../src/@types/data/galaxyCatalog/BiasMode';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';

// A real reconcile spy object matching the ReconcileEffects surface. Typed
// vi.fn<...>() throughout — bare vi.fn() fails tsc against typed callback fields.
type ReconcileSpies = {
  requestRender: ReturnType<typeof vi.fn<() => void>>;
  syncFades: ReturnType<typeof vi.fn<(rows: readonly VisibilityLayerKey[]) => void>>;
  reseedFlow: ReturnType<typeof vi.fn<() => void>>;
  bakeBias: ReturnType<typeof vi.fn<(mode: BiasMode) => void>>;
  captureScene: ReturnType<typeof vi.fn<() => SceneSnapshot>>;
  restoreScene: ReturnType<typeof vi.fn<(snapshot: SceneSnapshot, opts: { animate: boolean }) => void>>;
};

function buildStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });

  const reconcile: ReconcileEffects = {
    requestRender: vi.fn<() => void>(),
    syncFades: vi.fn<(rows: readonly VisibilityLayerKey[]) => void>(),
    reseedFlow: vi.fn<() => void>(),
    bakeBias: vi.fn<(mode: BiasMode) => void>(),
    captureScene: vi.fn<() => SceneSnapshot>(),
    restoreScene: vi.fn<(snapshot: SceneSnapshot, opts: { animate: boolean }) => void>(),
  };

  // setContext BEFORE running the sagas so getContext finds the closures when
  // any dispatched action triggers a worker.
  sagaMiddleware.setContext({ reconcile });

  // Run all four watchers under a shared root so they share the context above.
  sagaMiddleware.run(function* () {
    yield* all([watchWake(), watchFades(), watchFlowReseed(), watchBiasBake()]);
  });

  return { store, reconcile: reconcile as unknown as ReconcileSpies };
}

describe('reconcileSagas', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  // ── setMilkyWayEnabled ─────────────────────────────────────────────────────

  it('setMilkyWayEnabled(true) → requestRender called AND syncFades(["milkyWayDisk"]) called', () => {
    store.dispatch(setMilkyWayEnabled(true));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith(['milkyWayDisk']);
  });

  // ── synchronous-notify invariant: saga worker sees post-dispatch state ───────
  // RTK dispatch is synchronous; the saga `takeEvery` worker runs AFTER the
  // reducer. This test confirms the load-bearing invariant: when syncFades fires
  // inside reconcileSagas, it observes the flipped `milkyWay.enabled` value, not
  // the pre-dispatch stale value. An assertion that only lives INSIDE the spy
  // passes silently if the spy is never called; the call-count check outside
  // makes it fail loudly if the worker never fires (preventing vacuous passes).

  it('synchronous-notify: when watchFades fires, store.getState() sees POST-WRITE settings', () => {
    const before = store.getState().settings.milkyWay.enabled;

    // Mock the spy to assert it sees the FLIPPED value at the moment it runs.
    reconcile.syncFades.mockImplementationOnce(() => {
      expect(store.getState().settings.milkyWay.enabled).toBe(!before);
    });

    store.dispatch(setMilkyWayEnabled(!before));

    // Verify the spy actually ran — an assertion inside a never-called spy
    // can't make this test fail, so we gate on call-count outside.
    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
  });

  // ── setGalaxyCatalogSize — boring write, no FADE_ROW entry ────────────────

  it('setGalaxyCatalogSize(n) → requestRender called, syncFades NOT called', () => {
    store.dispatch(setGalaxyCatalogSize(4));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).not.toHaveBeenCalled();
  });

  // ── writeVolumeField — row-driven: fires regardless of what changed ────────

  it('writeVolumeField contrast patch → syncFades(["volumeField"]) fired', () => {
    // 'cf4-density' is a production volume seeded by buildInitialSettings. Any
    // patch (here contrast-only) triggers the row-driven sync; the no-op guard
    // lives in the fade bridge, not this saga.
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['volumeField']);
  });

  it('writeVolumeField idempotent: second identical dispatch → syncFades fires again', () => {
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));

    // Saga is row-driven; it fires on every dispatch. The bridge's own tests
    // cover the no-op-if-unchanged guard (Task 2.1).
    expect(reconcile.syncFades).toHaveBeenCalledTimes(2);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(1, ['volumeField']);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(2, ['volumeField']);
  });

  // ── setFlow — reseed gated on mode/count; fade fires for all setFlow ───────

  it('setFlow({count}) → reseedFlow called AND syncFades(["flow"]) called', () => {
    // count is defined → watchFlowReseed triggers reseedFlow.
    // setFlow is in FADE_ROW → watchFades triggers syncFades(['flow']).
    store.dispatch(setFlow({ count: 500 }));

    expect(reconcile.reseedFlow).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith(['flow']);
  });

  it('setFlow({mode}) → reseedFlow called AND syncFades(["flow"]) called', () => {
    // mode is defined → reseed fires.
    store.dispatch(setFlow({ mode: 'advect' }));

    expect(reconcile.reseedFlow).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith(['flow']);
  });

  it('setFlow({enabled:true}) → reseedFlow NOT called, syncFades(["flow"]) called', () => {
    // enabled-only patch: mode and count are both undefined → reseed guard
    // returns early. But setFlow is in FADE_ROW so syncFades still fires.
    store.dispatch(setFlow({ enabled: true }));

    expect(reconcile.reseedFlow).not.toHaveBeenCalled();
    expect(reconcile.syncFades).toHaveBeenCalledWith(['flow']);
  });

  // ── setBiasMode ────────────────────────────────────────────────────────────

  it('setBiasMode(1) → bakeBias(1) called', () => {
    store.dispatch(setBiasMode(1));

    expect(reconcile.bakeBias).toHaveBeenCalledTimes(1);
    expect(reconcile.bakeBias).toHaveBeenCalledWith(1);
  });

  it('setBiasMode fires requestRender in addition to bakeBias', () => {
    // setBiasMode is a settings write → watchWake fires regardless.
    store.dispatch(setBiasMode(2));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
    expect(reconcile.bakeBias).toHaveBeenCalledWith(2);
  });

  // ── WAKE_ROUTES — camera writes wake the loop; unrelated routes do not ───────
  // watchWake matches the WAKE_ROUTES set (settings + camera). A camera-slice
  // write must poke the passive scheduler; a write to a non-wake route (tier)
  // must not.

  it('a camera slice write (beginDrag) wakes the loop', () => {
    store.dispatch(beginDrag());

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  it('a camera slice write (setAutoRotate) wakes the loop', () => {
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  it('a tier write does NOT wake the loop (tier is not a WAKE_ROUTE)', () => {
    store.dispatch(setTier('large'));

    expect(reconcile.requestRender).not.toHaveBeenCalled();
  });

  // ── FADE_ROW mapping table — freezes action→visibility-layer registry ────────
  // The three wired test cases above (milkyWayDisk, volumeField, flow) prove that
  // the saga correctly dispatches syncFades([key]) for each FADE_ROW entry. This
  // section directly asserts the complete action→key mapping that the deleted
  // handle tests verified individually. The saga's USE of the table (dispatch →
  // syncFades([key])) is proven by the wired cases; this freezes the DATA table
  // so a stray future row fails.

  it('FADE_ROW: complete action→key mapping', () => {
    const fadeRowTests: Array<[{ type: string }, VisibilityLayerKey]> = [
      [setGalaxyCatalogVisible, 'survey'],
      [setGalaxyCatalogLabelEnabled, 'surveyLabel'],
      [setFilamentsEnabled, 'filaments'],
      [setMilkyWayEnabled, 'milkyWayDisk'],
      [setMilkyWayLabelEnabled, 'milkyWayLabel'],
      [setStructureItemEnabled, 'structureRing'],
      [setStructureLabelEnabled, 'structureLabel'],
      [writeVolumeField, 'volumeField'],
      [setVolumesEnabled, 'volumesMaster'],
      [setFlow, 'flow'],
    ];

    fadeRowTests.forEach(([actionCreator, expectedKey]) => {
      expect(FADE_ROW[actionCreator.type]).toBe(expectedKey);
    });

    // Freeze the table size so a stray row added later fails.
    expect(Object.keys(FADE_ROW)).toHaveLength(10);
  });
});
