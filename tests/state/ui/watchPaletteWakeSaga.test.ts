import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchPaletteWakeSaga } from '../../../src/state/ui/watchPaletteWakeSaga';
import { setPaletteOpen } from '../../../src/state/ui/uiSlice';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchPaletteWakeSaga', () => {
  let store: ReturnType<typeof build>;
  let requestRender: ReturnType<typeof vi.fn<() => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchPaletteWakeSaga);
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

  it('wakes the render loop when the palette opens', async () => {
    store.dispatch(setPaletteOpen(true));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('does not wake when the palette closes', async () => {
    store.dispatch(setPaletteOpen(false));
    await flush();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
