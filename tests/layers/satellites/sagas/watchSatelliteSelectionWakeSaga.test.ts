import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { watchSatelliteSelectionWakeSaga } from '../../../../src/layers/satellites/sagas/watchSatelliteSelectionWakeSaga';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../../src/state/selection/selectionSlice';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { ReconcileEffects } from '../../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchSatelliteSelectionWakeSaga', () => {
  let store: ReturnType<typeof build>;
  let requestRender: ReturnType<typeof vi.fn<() => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchSatelliteSelectionWakeSaga);
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

  it('wakes the render loop when a satellite is focused or selected', async () => {
    store.dispatch(updateSelectionFocus({ type: 'satellite', noradId: 25544 }, 'cut'));
    store.dispatch(updateSelectionSelect({ type: 'satellite', noradId: 25544 }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it('does not wake for any other selection', async () => {
    store.dispatch(updateSelectionFocus({ type: 'body', id: SCENE_EARTH.id }, 'cut'));
    await flush();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
