/**
 * watchFocusSelectedSaga tests — real store + saga middleware; the command is a
 * plain action, so the saga is driven by dispatching it and flushing a macrotask.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusSelectedSaga } from '../../../src/state/selection/watchFocusSelectedSaga';
import { focusSelected } from '../../../src/state/selection/focusSelected';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { selectionRoute } from '../../../src/store/constants';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';

const flush = () => new Promise((r) => setTimeout(r, 0));

function build() {
  const mw = createSagaMiddleware();
  const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
  mw.run(watchFocusSelectedSaga);
  return s;
}

describe('watchFocusSelectedSaga', () => {
  it('focusSelected focuses the selected ref', async () => {
    const store = build();
    const ref: SelectionRef = { type: 'milkyWay' };
    store.dispatch(updateSelectionSelect(ref));

    store.dispatch(focusSelected());
    await flush();

    expect(store.getState()[selectionRoute].focus).toEqual(ref);
  });

  it('focusSelected with nothing selected leaves focus unchanged', async () => {
    const store = build();

    store.dispatch(focusSelected());
    await flush();

    expect(store.getState()[selectionRoute].focus).toBeNull();
  });
});
