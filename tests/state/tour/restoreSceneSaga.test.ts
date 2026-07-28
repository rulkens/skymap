/**
 * restoreSceneSaga — integration tests over a real store + saga middleware.
 *
 * The saga is pure Intent: it `put`s `mergeSnapshot(settings)` then
 * `updateSelectionFocus(focus)` — no engine context, no fade call. (The fade is a
 * reactive consequence of the merge, owned by `watchFadesSaga` and tested there.)
 * Each test runs the saga directly (`sagaMiddleware.run`) against a real
 * `rootReducer` store and asserts both writes landed, settings before focus.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { restoreSceneSaga } from '../../../src/state/tour/restoreSceneSaga';
import { mergeSnapshot } from '../../../src/state/settings/settingsSlice';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { SceneSnapshot } from '../../../src/@types/engine/settings/SceneSnapshot';

const flush = () => new Promise((r) => setTimeout(r, 0));

const FOCUS_REF: SelectionRef = { type: 'structure', id: 'virgo-cluster' };

/** A scene snapshot whose eight clusters differ from the store's initial settings. */
function makeSnapshot(focus: SelectionRef | null = FOCUS_REF): SceneSnapshot {
  const f = makeSettingsFixture();
  return {
    settings: {
      galaxyCatalogs: { ...f.galaxyCatalogs, enabled: !f.galaxyCatalogs.enabled },
      structures: { ...f.structures, enabled: !f.structures.enabled },
      volumes: { ...f.volumes, enabled: !f.volumes.enabled },
      filaments: { ...f.filaments, intensity: 0.42 },
      milkyWay: { ...f.milkyWay, enabled: !f.milkyWay.enabled },
      flow: { ...f.flow, flowSpeed: 7 },
      orbitTrails: { ...f.orbitTrails, enabled: !f.orbitTrails.enabled },
      labels: { ...f.labels, focusedOnly: !f.labels.focusedOnly },
    },
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
});
