import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchInputWakeSaga } from '../../../src/state/input/watchInputWakeSaga';
import {
  inputGestureStarted,
  inputGestureEnded,
  inputMoved,
  inputHovered,
  inputTapped,
  inputConsumed,
  inputPickResolved,
} from '../../../src/state/input/inputSlice';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

function build() {
  const mw = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
  mw.run(watchInputWakeSaga);
  const requestRender = vi.fn<() => void>();
  const reconcile: ReconcileEffects = {
    requestRender,
    syncFades: vi.fn(),
    logCameraState: vi.fn(),
    applySwapFormat: vi.fn(),
  };
  mw.setContext({ reconcile });
  return { store, requestRender };
}

describe('watchInputWakeSaga', () => {
  it('wakes on gesture start, motion and end; never on hover, tap, consumed or pick resolved', async () => {
    const { store, requestRender } = build();
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.5, y: 0.5 } }));
    store.dispatch(inputTapped({ source: 'canvas', at: { x: 0.5, y: 0.5 } }));
    store.dispatch(inputConsumed());
    store.dispatch(inputPickResolved({ which: 'select', seq: 2 }));
    await flush();
    expect(requestRender).not.toHaveBeenCalled();

    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(inputMoved({ source: 'canvas', motion: [] }));
    store.dispatch(inputGestureEnded({ source: 'canvas' }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(3);
  });
});
