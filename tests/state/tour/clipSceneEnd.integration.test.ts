/**
 * What a clip's scene leaves behind, through the real seams: `playClip`, the clip player, a real
 * fade registry fed the way `engine.ts` feeds it, and an engine `settings` read that goes through
 * the player's view. A tour plays each beat clip with `keep`; every other play reverts.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore, type Action } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { call, fork, race, take } from 'typed-redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { seedVisibilityFades } from '../../../src/services/engine/wiring/seedVisibilityFades';
import { syncVisibilityTargets } from '../../../src/services/engine/wiring/syncVisibilityTargets';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { createPlayClip } from '../../../src/services/engine/animation/playClip';
import { UNSTARTED_EPOCHS } from '../../../src/services/engine/camera/drivers/cameraEpochs';
import { hold, show } from '../../../src/services/engine/animation/effectHelpers';
import { cosmicFlows } from '../../../src/compositions/clips/cosmicFlows';
import { APP_VISIBILITY_REGISTRY } from '../../../src/compositions/appVisibility';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';

const START = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 1 };
const FLOW = { address: 'flow' } as const;
const VIRGO = { type: 'structure', id: 'virgo' };
const SKIP = 'test/skip';

function makeEngine(boot: readonly Action[] = []) {
  const store = configureStore({ reducer: rootReducer });
  for (const action of boot) store.dispatch(action);
  const fades = createFadeRegistry({ requestRender: () => {} });
  const state = {
    get settings() {
      return player.view(store.getState()).settings;
    },
    subsystems: { fades, scheduler: { requestRender: vi.fn<() => void>() } },
    visibilityEntries: [...APP_VISIBILITY_REGISTRY],
    visibilityGates: new Map(),
  } as unknown as EngineState;
  const player = createClipPlayer({
    store,
    getCameraRuntime: () => {
      throw new Error('no frame roll here');
    },
    extractFocusRow: () => ({ row: null, focusId: null }),
    syncVisibility: (settings, overMs) => syncVisibilityTargets({ ...state, settings }, overMs),
  });
  seedVisibilityFades(state);
  const playClip = createPlayClip({ store, clipPlayer: player, getLivePose: () => START });
  let epoch = UNSTARTED_EPOCHS.clip;
  const tick = (nowMs: number) => {
    epoch = player.tick(epoch, nowMs).clipEpoch;
  };
  return { store, fades, player, playClip, tick };
}

describe("a clip's scene at its end", () => {
  it("a beat's enter-clip scene holds through its dwell", async () => {
    const { store, fades, playClip, tick } = makeEngine();
    const enter: ClipData = { timeline: [show(['flow'], 4), hold(1)] };
    const dwell: ClipData = { timeline: [hold(5)] };

    const entered = playClip(enter, DEFAULT_ORIENTATION, 'keep');
    tick(0);
    expect(store.getState().settings.flow.enabled).toBe(false);
    tick(1000);
    tick(2000);
    await entered;
    expect(store.getState().camera.clip).toBeNull();

    void playClip(dwell, DEFAULT_ORIENTATION, 'keep');
    tick(3000);
    expect(store.getState().settings.flow.enabled).toBe(true);
    expect(fades.targetOf(FLOW)).toBe(1);
    // The 4 s show ramp started at 0 carries across the seam untouched.
    const mid = fades.opacityOf(FLOW, 3000);
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.95);
  });

  it('a keep play stopped by a saga cancel commits its focus without a camera flight', () => {
    // A tour's skip, Prev, exit or pause cancels `playClip` inside saga execution, which
    // runs the commit's takers only after `clipEnded` lands, past `suspendDuringClip`.
    const sagas = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (d) => d({ serializableCheck: false, immutableCheck: false }).concat(sagas),
    });
    const extractRow = vi.fn(() => null);
    sagas.setContext({ selection: { extractRow }, cameraRuntime: () => ({}) });
    const player = createClipPlayer({
      store,
      getCameraRuntime: () => {
        throw new Error('no frame roll here');
      },
      extractFocusRow: () => ({ row: null, focusId: null }),
      syncVisibility: () => {},
    });
    const playClip = createPlayClip({ store, clipPlayer: player, getLivePose: () => START });
    const clip: ClipData = { timeline: [{ kind: 'focus', ref: VIRGO }, hold(5)] };
    sagas.run(function* () {
      yield* fork(watchFocusTweenSaga);
      yield* race({
        played: call(playClip, clip, DEFAULT_ORIENTATION, 'keep' as const),
        skipped: take(SKIP),
      });
    });
    let epoch = UNSTARTED_EPOCHS.clip;
    epoch = player.tick(epoch, 0).clipEpoch;
    player.tick(epoch, 1000);

    store.dispatch({ type: SKIP });
    expect(store.getState().camera.clip).toBeNull();
    expect(store.getState().selection.focus).toEqual(VIRGO);
    expect(extractRow).not.toHaveBeenCalled();
  });

  it("a standalone clip's scene reverts at its end", async () => {
    const { store, fades, player, playClip, tick } = makeEngine([
      setVisibility({ cluster: 'cosmicWebDensity', field: 'enabled', on: true }),
    ]);
    const intent = store.getState().settings;

    const played = playClip(cosmicFlows.data, DEFAULT_ORIENTATION, 'revert');
    tick(0);
    tick(2500); // the web hides, flow switches on behind its mask
    expect(player.view(store.getState()).settings.cosmicWebDensity.enabled).toBe(false);
    expect(fades.targetOf(FLOW)).toBe(1);
    for (let nowMs = 3000; nowMs <= 30_000; nowMs += 1000) tick(nowMs);
    await played;

    expect(store.getState().settings).toBe(intent);
    expect(player.view(store.getState())).toBe(store.getState());
    expect(store.getState().settings.cosmicWebDensity.enabled).toBe(true);
    expect(fades.targetOf(FLOW)).toBe(0);
  });
});
