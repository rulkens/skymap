import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchSelectionRevealSaga } from '../../../src/state/selection/watchSelectionRevealSaga';
import {
  updateSelectionFocus,
  updateSelectionHover,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { takeoverStarted } from '../../../src/state/takeover/takeoverActions';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { settingsRoute } from '../../../src/store/constants';
import { EARTH_REF } from '../../../src/data/selection/earthRef';
import type { RootState } from '../../../src/store/types';

const ISS = { type: 'satellite', noradId: 25544 } as const;
const SATELLITES_ON = setVisibility({ cluster: 'satellites', field: 'enabled', on: true });

function build(preloadedState?: RootState) {
  const writes: Action[] = [];
  const errors: unknown[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    if (setVisibility.match(action)) writes.push(action);
    return next(action);
  };
  const mw = createSagaMiddleware({ onError: (e) => errors.push(e) });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (g) => g().concat(recorder, mw),
  });
  mw.run(watchSelectionRevealSaga);
  return { store, writes, errors };
}

describe('watchSelectionRevealSaga', () => {
  it('switches Satellites on when a satellite is focused with the section off', () => {
    const h = build();
    h.store.dispatch(updateSelectionFocus(ISS));
    expect(h.writes).toEqual([SATELLITES_ON]);
    expect(h.store.getState()[settingsRoute].satellites.enabled).toBe(true);
  });

  it('switches Satellites on when a satellite is selected', () => {
    const h = build();
    h.store.dispatch(updateSelectionSelect(ISS));
    expect(h.writes).toEqual([SATELLITES_ON]);
  });

  it('does nothing on hover', () => {
    const h = build();
    h.store.dispatch(updateSelectionHover(ISS));
    expect(h.writes).toEqual([]);
  });

  it('does nothing during a clip', () => {
    const h = build();
    h.store.dispatch(
      clipStarted({ data: { start: 'live', timeline: [] }, frame: DEFAULT_ORIENTATION }),
    );
    h.store.dispatch(updateSelectionFocus(ISS));
    expect(h.writes).toEqual([]);
  });

  // A takeover's exit restore re-focuses the captured subject after restoring the settings;
  // a reveal there would undo the viewer's own switch.
  it('does nothing while a takeover runs', () => {
    const h = build();
    h.store.dispatch(takeoverStarted({ kind: 'tour', id: 'grandTour' }));
    h.store.dispatch(updateSelectionFocus(ISS));
    expect(h.writes).toEqual([]);
  });

  it('does nothing when the section is already on', () => {
    const h = build();
    h.store.dispatch(SATELLITES_ON);
    h.writes.length = 0;
    h.store.dispatch(updateSelectionFocus(ISS));
    expect(h.writes).toEqual([]);
  });

  it('writes nothing for a kind no entry selects', () => {
    const h = build();
    h.store.dispatch(updateSelectionFocus(EARTH_REF));
    expect(h.writes).toEqual([]);
  });

  it('writes nothing when the cluster has only per-item switches', () => {
    const seed = rootReducer(undefined, { type: '@@init' });
    const { items } = seed[settingsRoute].satellites;
    const itemsOnly = {
      ...seed,
      [settingsRoute]: { ...seed[settingsRoute], satellites: { items } },
    };
    const h = build(itemsOnly as unknown as RootState);
    h.store.dispatch(updateSelectionFocus(ISS));
    expect(h.writes).toEqual([]);
    expect(h.errors).toEqual([]);
  });
});
