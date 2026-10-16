/**
 * A cue's `over` must reach the fade through the live store: the settings write wakes
 * `watchFadesSaga` synchronously inside `dispatch`, so whichever sync runs first sets the
 * ramp. A real store, the real saga, the real reconcile closures and a real fade registry.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFadesSaga } from '../../../src/store/effects/watchFadesSaga';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { makeReconcileEffects } from '../../../src/services/engine/wiring/makeReconcileEffects';
import { seedVisibilityFades } from '../../../src/services/engine/wiring/seedVisibilityFades';
import { applySceneEffect } from '../../../src/services/animation/applySceneEffect';
import { hide, show } from '../../../src/services/engine/animation/effectHelpers';
import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import type { Action } from '@reduxjs/toolkit';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';

// `boot` writes land before the saga runs and before seeding, so they set the starting fade.
function makeLive(boot: readonly Action[] = []) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  for (const action of boot) store.dispatch(action);
  const fades = createFadeRegistry({ requestRender: () => {} });
  const state = {
    get settings() {
      return store.getState().settings;
    },
    subsystems: { fades, scheduler: { requestRender: vi.fn<() => void>() } },
    visibilityEntries: [...APP_VISIBILITY],
    visibilityGates: new Map(),
    fadeRows: [],
  } as unknown as EngineState;
  seedVisibilityFades(state);
  sagaMiddleware.setContext({ reconcile: makeReconcileEffects(state, {} as HTMLCanvasElement) });
  sagaMiddleware.run(watchFadesSaga);
  return { store, state, fades };
}

describe("a cue's over reaches the fade through the live saga", () => {
  it('show over 9 s is mid-ramp at 4.5 s', () => {
    const { store, state, fades } = makeLive();
    expect(fades.opacityOf({ address: 'flow' }, 0)).toBe(0);
    applySceneEffect(show(['flow'], 9), { state, store });
    const mid = fades.opacityOf({ address: 'flow' }, 4500);
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.95);
  });

  it('hide over 0 lands at 0 at once', () => {
    const { store, state, fades } = makeLive([
      setVisibility({ cluster: 'flow', field: 'enabled', on: true }),
    ]);
    expect(fades.opacityOf({ address: 'flow' }, 0)).toBe(1);
    applySceneEffect(hide(['flow'], 0), { state, store });
    expect(fades.opacityOf({ address: 'flow' }, 0)).toBe(0);
  });
});
