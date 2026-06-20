import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusTween } from '../../../src/state/selection/focusTweenSaga';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchFocusTween', () => {
  let store: ReturnType<typeof build>;
  let runFocusTween: ReturnType<typeof vi.fn<(ref: unknown) => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchFocusTween);
    runFocusTween = vi.fn<(ref: unknown) => void>();
    mw.setContext({ runFocusTween });
    return s;
  }
  beforeEach(() => {
    store = build();
  });

  it('a focus ref change runs the tween with the ref', async () => {
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(runFocusTween).toHaveBeenCalledWith({ type: 'milkyWay' });
  });
  it('a select (non-focus) write does NOT run the tween', async () => {
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await flush();
    expect(runFocusTween).not.toHaveBeenCalled();
  });
});
