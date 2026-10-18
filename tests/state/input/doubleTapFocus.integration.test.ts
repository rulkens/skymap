/**
 * B1: a double-tap's focus fly must survive its own second press. The second
 * press's `inputGestureStarted` clears any tween, so it has to reach the store
 * before `focusSelected` starts the fly. Real reducer, real focus sagas, the
 * canvas source saga over a hand-driven channel.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware, { buffers, eventChannel } from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { inputSourceSaga } from '../../../src/state/input/inputSourceSaga';
import { watchFocusSelectedSaga } from '../../../src/state/selection/watchFocusSelectedSaga';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { cameraRoute } from '../../../src/store/constants';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';

const settle = () => new Promise((r) => setTimeout(r, 0));
const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
const AT = { x: 0.5, y: 0.5 };

describe('double-tap focus', () => {
  it('press, release, press, release on a selected galaxy: the focus tween started by focusSelected survives', async () => {
    const mw = createSagaMiddleware();
    const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.setContext({
      selection: composeSelectionRows(
        () => [...coreSelectionRows(), milkyWaySelectionRow()],
        () => ALL_KINDS_ENABLED,
      ),
      cameraRuntime: () => ({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 9 },
        fovYRad: 0.8,
        aspect: 2,
        upBasisQuat: [0, 0, 0, 1],
      }),
    });
    mw.run(watchFocusSelectedSaga);
    mw.run(watchFocusTweenSaga);

    let emit!: (e: DeviceEvent) => void;
    const channel = eventChannel<DeviceEvent>((e) => {
      emit = e;
      return () => {};
    }, buffers.expanding());
    mw.run(() => inputSourceSaga('canvas', channel));

    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    emit({ kind: 'resize', t: 0, widthPx: 200, heightPx: 100 });
    let t = 0;
    for (const kind of ['down', 'up', 'down', 'up'] as const) {
      const ev = { pointer: 1, pointerType: 'mouse', button: 0, at: AT, mods: NO_MODS } as const;
      emit({ kind, t: (t += 50), ...ev });
    }
    await settle();

    expect(store.getState()[cameraRoute].tween).not.toBeNull();
  });
});
