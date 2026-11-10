import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Middleware } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchGestureLearnedSaga } from '../../../src/state/ui/watchGestureLearnedSaga';
import { gestureLearned } from '../../../src/state/ui/uiSlice';
import { selectLearnedGestures } from '../../../src/state/ui/selectors';
import { inputGestureStarted, inputMoved } from '../../../src/state/input/inputSlice';
import type { Motion } from '../../../src/@types/input/Motion';

const flush = () => new Promise((r) => setTimeout(r, 0));

function build() {
  const learnedActions: string[] = [];
  const spy: Middleware = () => (next) => (action) => {
    if (gestureLearned.match(action)) learnedActions.push(action.payload);
    return next(action);
  };
  const mw = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(spy, mw) });
  const task = mw.run(watchGestureLearnedSaga);
  return { store, task, learnedActions };
}

const drag = (dx: number): Motion => ({
  intent: 'orbit',
  dx,
  dy: 0,
  ratio: 1,
  at: null,
  held: true,
});
const wheel: Motion = { intent: 'zoom', dx: 0, dy: 0, ratio: 1.1, at: null, held: false };
const move = (...motion: Motion[]) => inputMoved({ source: 'canvas', motion });
const press = () => inputGestureStarted({ source: 'canvas', intent: 'orbit' });

describe('watchGestureLearnedSaga', () => {
  it('a click’s jitter, even repeated, never learns look; one real drag does', async () => {
    const { store } = build();
    for (let i = 0; i < 10; i++) {
      store.dispatch(press());
      store.dispatch(move(drag(0.01)));
    }
    await flush();
    expect(selectLearnedGestures(store.getState()).look).toBe(false);

    store.dispatch(press());
    for (let i = 0; i < 6; i++) store.dispatch(move(drag(0.01)));
    await flush();
    expect(selectLearnedGestures(store.getState())).toEqual({ look: true, zoom: false });
  });

  it('learns each gesture once, then stops listening', async () => {
    const { store, task, learnedActions } = build();
    store.dispatch(move(wheel));
    store.dispatch(move(wheel));
    store.dispatch(press());
    store.dispatch(move(drag(0.2), drag(0.2)));
    await flush();
    expect(learnedActions).toEqual(['zoom', 'look']);
    expect(task.isRunning()).toBe(false);
  });
});
