/**
 * restoreSceneSaga — integration tests over a real store + saga middleware.
 *
 * The saga is pure Intent: it `put`s `mergeSnapshot(settings)`, then
 * `requestOrientationChange(orientation)`, then `updateSelectionFocus(focus)` —
 * no engine context, no fade call. (The fade is a reactive consequence of the
 * merge, owned by `watchFadesSaga` and tested there.) Most tests run the saga
 * directly (`sagaMiddleware.run`) against a real `rootReducer` store; the
 * orientation tests additionally run `watchOrientationChangeSaga` so the
 * request actually resolves, proving the restore doesn't take the raw
 * `mergeSnapshot` shortcut for that field.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { restoreSceneSaga } from '../../../src/state/scene/restoreSceneSaga';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { watchOrientationChangeSaga } from '../../../src/state/camera/watchOrientationChangeSaga';
import { requestOrientationChange } from '../../../src/state/camera/orientationActions';
import {
  setRate,
  setDirection,
  pause,
  setSimDays,
  goLive,
} from '../../../src/state/time/timeSlice';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import type { TimeState } from '../../../src/@types/time/TimeState';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';

const flush = () => new Promise((r) => setTimeout(r, 0));

const FOCUS_REF: SelectionRef = { type: 'structure', id: 'virgo-cluster' };

/** A scene snapshot whose clusters differ from the store's initial settings. */
const MANUAL_PAUSED: TimeState = {
  mode: 'manual',
  anchor: { simDays: 2460000.5, realMs: 100 },
  rateIndex: 0,
  direction: 1,
  paused: true,
};

function makeSnapshot(
  focus: SelectionRef | null = FOCUS_REF,
  time: TimeState = MANUAL_PAUSED,
  capturedAtMs = 100,
): SceneSnapshot {
  const f = makeSettingsFixture();
  return {
    settings: {
      galaxyCatalogs: { ...f.galaxyCatalogs },
      structures: { ...f.structures },
      cosmicWebDensity: { ...f.cosmicWebDensity, enabled: !f.cosmicWebDensity.enabled },
      cosmicWebFilaments: { ...f.cosmicWebFilaments, intensity: 0.42 },
      milkyWay: { ...f.milkyWay, enabled: !f.milkyWay.enabled },
      zoneOfAvoidance: { ...f.zoneOfAvoidance, enabled: !f.zoneOfAvoidance.enabled },
      flow: { ...f.flow, flowSpeed: 7 },
      localBubble: { ...f.localBubble, enabled: !f.localBubble.enabled },
      constellations: { ...f.constellations, enabled: !f.constellations.enabled },
      orbitTrails: { ...f.orbitTrails, enabled: !f.orbitTrails.enabled },
      starCatalogs: { ...f.starCatalogs, enabled: !f.starCatalogs.enabled },
      bodies: { ...f.bodies },
      blackHoles: { items: { 'sgr-a-star': { labelEnabled: false } } },
      labels: { ...f.labels, focusedOnly: !f.labels.focusedOnly },
      picking: { ...f.picking },
      camera: { ...f.camera, fovDeg: f.camera.fovDeg + 13 },
    },
    orientation: f.orientation,
    focus,
    time,
    capturedAtMs,
  };
}

function buildHarness() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(sagaMiddleware),
  });
  return { store, sagaMiddleware };
}

describe('restoreSceneSaga', () => {
  it('merges the captured settings back onto the store', async () => {
    const { store, sagaMiddleware } = buildHarness();
    sagaMiddleware.run(restoreSceneSaga, makeSnapshot());
    await flush();

    expect(store.getState().settings.flow.flowSpeed).toBe(7);
    expect(store.getState().settings.cosmicWebFilaments.intensity).toBe(0.42);
  });

  it('reverts selection.focus onto the store', async () => {
    const { store, sagaMiddleware } = buildHarness();

    sagaMiddleware.run(restoreSceneSaga, makeSnapshot(FOCUS_REF));
    await flush();

    // The focus slot now holds the captured ref — proof the updateSelectionFocus
    // put landed (the ordering test below pins that it goes through that action).
    expect(store.getState().selection.focus).toEqual(FOCUS_REF);
  });

  it('a null-focus snapshot clears the focus slot', async () => {
    const { store, sagaMiddleware } = buildHarness();
    // Seed a focus so the restore has something non-null to clear.
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'coma-cluster' }));

    sagaMiddleware.run(restoreSceneSaga, makeSnapshot(null));
    await flush();

    expect(store.getState().selection.focus).toBeNull();
  });

  it('dispatches settings BEFORE focus', async () => {
    const order: string[] = [];
    const sagaMiddleware = createSagaMiddleware();
    const recorder = () => (next: (a: unknown) => unknown) => (action: unknown) => {
      const type = (action as { type: string }).type;
      if (type === mergeSnapshot({}).type) order.push('merge');
      if (type === updateSelectionFocus(null).type) order.push('focus');
      return next(action);
    };
    const store = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(recorder, sagaMiddleware),
    });

    sagaMiddleware.run(restoreSceneSaga, makeSnapshot());
    await flush();

    expect(order).toEqual(['merge', 'focus']);
    expect(store.getState().settings.flow.flowSpeed).toBe(7);
  });

  it("a tour that changed the orientation restores the viewer's frame", async () => {
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(sagaMiddleware),
    });
    // A null runtime still lands `settings.orientation` (see
    // watchOrientationChangeSaga.test.ts's "null cameraRuntime" case) — this
    // exercises the restore's dispatch without fabricating a camera pose.
    sagaMiddleware.setContext({ cameraRuntime: () => null });
    sagaMiddleware.run(watchOrientationChangeSaga);

    const before = store.getState().settings.orientation;
    expect(before).not.toBe('galactic');

    // Stand in for the next task's tour-authored `frameTo` cue: it switches
    // frames mid-run through the same production action an interactive
    // switch uses.
    store.dispatch(requestOrientationChange('galactic'));
    await flush();
    expect(store.getState().settings.orientation).toBe('galactic');

    sagaMiddleware.run(restoreSceneSaga, makeSnapshot());
    await flush();

    expect(store.getState().settings.orientation).toBe(before);
  });

  it('restores orientation through requestOrientationChange, not a raw settings write', async () => {
    const seen: { mergePayload?: unknown; orientationRequest?: unknown } = {};
    const sagaMiddleware = createSagaMiddleware();
    const recorder = () => (next: (a: unknown) => unknown) => (action: unknown) => {
      const a = action as { type: string; payload?: unknown };
      if (a.type === mergeSnapshot({}).type) seen.mergePayload = a.payload;
      if (a.type === requestOrientationChange('ecliptic').type) seen.orientationRequest = a.payload;
      return next(action);
    };
    const store = configureStore({
      reducer: rootReducer,
      middleware: (g) => g().concat(recorder, sagaMiddleware),
    });

    const snapshot = makeSnapshot();
    sagaMiddleware.run(restoreSceneSaga, snapshot);
    await flush();

    // The merge patch must not carry `orientation` — writing it there would
    // reach `mergeSettingsSnapshot`'s raw field assignment and strand
    // `camera.base` in the old basis (see `mergeSnapshotAction`'s `mergeSnapshot`).
    expect(seen.mergePayload).not.toHaveProperty('orientation');
    // Instead it goes through the same request path an interactive switch
    // uses, carrying the captured pre-tour frame.
    expect(seen.orientationRequest).toBe(snapshot.orientation);
  });

  describe('clock', () => {
    afterEach(() => vi.restoreAllMocks());

    it('exit restores a manual paused clock to its captured instant', async () => {
      const { store, sagaMiddleware } = buildHarness();
      store.dispatch(setSimDays({ simDays: 2470000, nowMs: 5 }));
      store.dispatch(goLive({ simDays: 2480000, nowMs: 6 }));

      sagaMiddleware.run(restoreSceneSaga, makeSnapshot());
      await flush();

      const { time } = store.getState();
      expect(time.mode).toBe('manual');
      expect(time.paused).toBe(true);
      expect(deriveSimDays(time, performance.now() + 1e7)).toBe(2460000.5);
    });

    it('exit restores a live clock to live at the real now', async () => {
      const { store, sagaMiddleware } = buildHarness();
      const live: TimeState = {
        mode: 'live',
        anchor: { simDays: 2451545, realMs: 0 },
        rateIndex: 0,
        direction: 1,
        paused: false,
      };
      store.dispatch(setSimDays({ simDays: 2470000, nowMs: 5 }));
      const wallMs = Date.UTC(2031, 5, 1);
      vi.spyOn(Date, 'now').mockReturnValue(wallMs);

      sagaMiddleware.run(restoreSceneSaga, makeSnapshot(FOCUS_REF, live, 1));
      await flush();

      const { time } = store.getState();
      expect(time.mode).toBe('live');
      expect(time.anchor.simDays).toBe(unixMsToJulianDays(wallMs));
    });

    it('exit restores rate and direction changed inside the takeover', async () => {
      const { store, sagaMiddleware } = buildHarness();
      const captured: TimeState = { ...MANUAL_PAUSED, rateIndex: 2, direction: -1, paused: false };
      store.dispatch(setRate({ rateIndex: 5, nowMs: 5 }));
      store.dispatch(setDirection({ direction: 1, nowMs: 5 }));
      store.dispatch(pause({ nowMs: 5 }));

      sagaMiddleware.run(restoreSceneSaga, makeSnapshot(FOCUS_REF, captured));
      await flush();

      const { time } = store.getState();
      expect([time.mode, time.rateIndex, time.direction, time.paused]).toEqual([
        'manual',
        2,
        -1,
        false,
      ]);
    });
  });
});
