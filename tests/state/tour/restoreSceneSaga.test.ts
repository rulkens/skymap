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

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { restoreSceneSaga } from '../../../src/state/tour/restoreSceneSaga';
import { mergeSnapshot } from '../../../src/state/settings/settingsSlice';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { watchOrientationChangeSaga } from '../../../src/state/camera/watchOrientationChangeSaga';
import { requestOrientationChange } from '../../../src/state/camera/orientationActions';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';

const flush = () => new Promise((r) => setTimeout(r, 0));

const FOCUS_REF: SelectionRef = { type: 'structure', id: 'virgo-cluster' };

/** A scene snapshot whose ten clusters differ from the store's initial settings. */
function makeSnapshot(focus: SelectionRef | null = FOCUS_REF): SceneSnapshot {
  const f = makeSettingsFixture();
  return {
    settings: {
      galaxyCatalogs: { ...f.galaxyCatalogs },
      structures: { ...f.structures },
      volumes: { ...f.volumes, enabled: !f.volumes.enabled },
      filaments: { ...f.filaments, intensity: 0.42 },
      milkyWay: { ...f.milkyWay, enabled: !f.milkyWay.enabled },
      flow: { ...f.flow, flowSpeed: 7 },
      orbitTrails: { ...f.orbitTrails, enabled: !f.orbitTrails.enabled },
      starCatalogs: { ...f.starCatalogs, enabled: !f.starCatalogs.enabled },
      bodies: { ...f.bodies },
      labels: { ...f.labels, focusedOnly: !f.labels.focusedOnly },
    },
    orientation: f.orientation,
    focus,
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
    expect(store.getState().settings.filaments.intensity).toBe(0.42);
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
    // `camera.base` in the old basis (see settingsSlice's `mergeSnapshot`).
    expect(seen.mergePayload).not.toHaveProperty('orientation');
    // Instead it goes through the same request path an interactive switch
    // uses, carrying the captured pre-tour frame.
    expect(seen.orientationRequest).toBe(snapshot.orientation);
  });
});
