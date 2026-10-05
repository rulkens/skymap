import { afterEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { loadSpacecraftTracksSaga } from '../../../src/state/missions/loadSpacecraftTracksSaga';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../src/services/bodies/trajectoryRegistry';
import { writeSpacecraftTracks } from '../../../tools/utils/io/writeSpacecraftTracks';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));
const T0 = 2444000.5;

function build() {
  const mw = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
  mw.run(loadSpacecraftTracksSaga);
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

const ready = engineStatusChanged({ kind: 'ready', count: 1 });

afterEach(() => vi.unstubAllGlobals());

describe('loadSpacecraftTracksSaga', () => {
  it('a failed track fetch leaves the craft absent and does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'nf' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, requestRender } = build();
    store.dispatch(ready);
    await flush();
    expect(trajectoryRegistry.get('voyager1')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(requestRender).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a track arriving while paused shows the craft', async () => {
    const bytes = writeSpacecraftTracks([
      {
        id: 'voyager1',
        tDays: Float64Array.from([T0, T0 + 10]),
        posKm: Float64Array.from([1e9, 0, 0, 1e9, 0, 0]),
        velKmS: new Float32Array(6),
      },
    ]);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(body) }),
    );
    const t = T0 + 5;
    const before = deriveBodyStates(t).get('voyager1')!.positionMpc;
    const { store, requestRender } = build();
    store.dispatch(ready);
    await flush();
    expect(deriveBodyStates(t).get('voyager1')!.positionMpc).not.toEqual(before);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
