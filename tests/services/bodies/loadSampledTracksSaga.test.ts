import { afterEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Middleware } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { loadSampledTracksSaga } from '../../../src/services/bodies/loadSampledTracksSaga';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import { trajectoryRegistry } from '../../../src/services/bodies/trajectoryRegistry';
import { sampledTracksSettled } from '../../../src/services/bodies/sampledTracksSettled';
import { writeSampledTracks } from '../../../tools/utils/io/writeSampledTracks';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

const flush = () => new Promise((r) => setTimeout(r, 0));
const T0 = 2444000.5;

function build(ids: readonly string[]) {
  const mw = createSagaMiddleware();
  const settled: unknown[] = [];
  const record: Middleware = () => (next) => (action) => {
    if (sampledTracksSettled.match(action)) settled.push(action.payload.ids);
    return next(action);
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(mw, record),
  });
  mw.run(loadSampledTracksSaga(ids.map((id) => asSceneBodyId(id))));
  const requestRender = vi.fn<() => void>();
  const reconcile: ReconcileEffects = {
    requestRender,
    syncFades: vi.fn(),
    logCameraState: vi.fn(),
    applySwapFormat: vi.fn(),
  };
  mw.setContext({ reconcile });
  return { store, requestRender, settled };
}

const ready = engineStatusChanged({ kind: 'ready', count: 1 });

afterEach(() => vi.unstubAllGlobals());

function trackFile(id: string): ArrayBuffer {
  const bytes = writeSampledTracks([
    {
      id,
      tDays: Float64Array.from([T0, T0 + 10]),
      posKm: Float64Array.from([1e9, 0, 0, 1e9, 0, 0]),
      velKmS: new Float32Array(6),
    },
  ]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('loadSampledTracksSaga', () => {
  it('fetches one file per id, and a failed fetch leaves only that body absent', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('sampledTrack.probe-7.bin')
          ? { ok: true, arrayBuffer: () => Promise.resolve(trackFile('probe-7')) }
          : { ok: false, status: 404, statusText: 'nf' },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, requestRender, settled } = build(['probe-9', 'probe-7']);
    store.dispatch(ready);
    await flush();
    expect(fetchMock.mock.calls.map(([url]) => url.split('/').pop())).toEqual([
      'sampledTrack.probe-9.bin',
      'sampledTrack.probe-7.bin',
    ]);
    expect(trajectoryRegistry.get('probe-9')).toBeUndefined();
    expect(trajectoryRegistry.get('probe-7')).toBeDefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(requestRender).toHaveBeenCalledTimes(1);
    // The failed id settles too, or a focus waiting on its window would hang.
    expect(settled).toEqual([['probe-9', 'probe-7']]);
    warn.mockRestore();
  });
});
