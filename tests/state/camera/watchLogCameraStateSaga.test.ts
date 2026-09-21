/**
 * watchLogCameraStateSaga tests — integration over a real store + saga
 * middleware, with the engine's `reconcile.logCameraState` effect stubbed via
 * `sagaMiddleware.setContext` (mirroring `watchGoHomeSaga.test.ts`).
 * `logCameraState` is a plain action, so the saga is driven purely by
 * dispatching it and flushing a macrotask. `location` is a node-environment
 * global this suite doesn't otherwise have, so the share-URL cases stub it.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchLogCameraStateSaga } from '../../../src/state/camera/watchLogCameraStateSaga';
import { logCameraState } from '../../../src/state/camera/logCameraState';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';
import { julianDaysToUnixMs } from '../../../src/utils/time/julianDaysToUnixMs';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

const FRAMED = absoluteArm({ target: [1, 2, 3], yaw: 0.7, pitch: -0.2, distance: 5.5 });
const SIM_DAYS = 2461304.571778822;

function build(logCameraStateFx: ReconcileEffects['logCameraState']) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({ reconcile: { logCameraState: logCameraStateFx } });
  sagaMiddleware.run(watchLogCameraStateSaga);
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('watchLogCameraStateSaga', () => {
  it('calls the reconcile log-camera effect once when logCameraState is dispatched', async () => {
    const logCameraStateFx = vi.fn(() => null);
    const store = build(logCameraStateFx);

    store.dispatch(logCameraState());
    await flush();

    expect(logCameraStateFx).toHaveBeenCalledTimes(1);
  });

  it('logs nothing further when the camera is not ready (a null dump)', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const store = build(vi.fn(() => null));

    store.dispatch(logCameraState());
    await flush();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs a share URL carrying the rendered pose and the rendered frame’s instant', async () => {
    vi.stubGlobal('location', { origin: 'https://skymap.test', pathname: '/', search: '' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = build(vi.fn(() => ({ framed: FRAMED, simDays: SIM_DAYS })));

    store.dispatch(logCameraState());
    await flush();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [, url] = logSpy.mock.calls[0] as [string, string];
    expect(url.startsWith('https://skymap.test/#')).toBe(true);
    const params = parseHashParams(url.slice(url.indexOf('#') + 1));
    expect(params.get('pose')).toBe(encodeFramedPose(FRAMED));
    expect(params.get('t')).toBe(new Date(julianDaysToUnixMs(SIM_DAYS)).toISOString());
  });
});
