import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchSelectionWakeSaga } from '../../../src/state/selection/watchSelectionWakeSaga';
import {
  updateSelectionSelect,
  updateSelectionFocus,
  updateSelectionHover,
  clearSelection,
} from '../../../src/state/selection/selectionSlice';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchSelectionWakeSaga', () => {
  let store: ReturnType<typeof build>;
  let requestRender: ReturnType<typeof vi.fn<() => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchSelectionWakeSaga);
    requestRender = vi.fn<() => void>();
    // requestRender lives in the reconcile bag (PR #352); inject the whole
    // surface with spies, mirroring tests/store/effects/watchFadesSaga.test.ts.
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

  it('select wakes the loop', async () => {
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
  it('a structure hover change requests a render; a non-structure hover change does not', async () => {
    store.dispatch(updateSelectionHover({ type: 'milkyWay' }));
    store.dispatch(updateSelectionHover({ type: 'body', id: 'earth' }));
    await flush();
    expect(requestRender).not.toHaveBeenCalled();

    store.dispatch(updateSelectionHover({ type: 'structure', id: 'cluster-virgo' }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);

    // Re-hovering the same structure is no change; leaving it is.
    store.dispatch(updateSelectionHover({ type: 'structure', id: 'cluster-virgo' }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);
    store.dispatch(updateSelectionHover(null));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(2);
  });
  it('clearSelection wakes the loop so the focus ring redraws away', async () => {
    // Regression: clearSelection (Esc / InfoCard ×) drops the select+focus refs,
    // but render-on-demand means the frame holding the focus ring never redraws
    // unless this action also wakes the loop — so the ring lingers on screen.
    store.dispatch(clearSelection());
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
