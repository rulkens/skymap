import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { watchDebugPanelWakeSaga } from '../../../../src/layers/body/sagas/watchDebugPanelWakeSaga';
import { setDebugPanelOpen, toggleDebugPanelOpen } from '../../../../src/state/ui/uiSlice';
import type { ReconcileEffects } from '../../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchDebugPanelWakeSaga', () => {
  let store: ReturnType<typeof build>;
  let requestRender: ReturnType<typeof vi.fn<() => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchDebugPanelWakeSaga);
    requestRender = vi.fn<() => void>();
    const reconcile: ReconcileEffects = {
      requestRender,
      syncFades: vi.fn(),
      logCameraState: vi.fn(),
      applySwapFormat: vi.fn(),
    };
    mw.setContext({ reconcile });
    return s;
  }
  beforeEach(() => {
    store = build();
  });

  // Bug caught: the panel opening while the loop sleeps (paused clock) and showing the
  // seeded empty readout, or another body's stale one, until an unrelated wake.
  it('wakes the render loop when the debug panel opens, by set or by toggle', async () => {
    store.dispatch(setDebugPanelOpen(true));
    store.dispatch(setDebugPanelOpen(false));
    store.dispatch(toggleDebugPanelOpen());
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(2);
  });
});
