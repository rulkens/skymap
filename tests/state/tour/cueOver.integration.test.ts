/**
 * A scene step's `over` (seconds) must reach the fade registry as the ramp's duration: the clip
 * player publishes each crossed step through the same `syncVisibilityTargets` the engine wires,
 * over a real store and a real fade registry.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { seedVisibilityFades } from '../../../src/services/engine/wiring/seedVisibilityFades';
import { syncVisibilityTargets } from '../../../src/services/engine/wiring/syncVisibilityTargets';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { UNSTARTED_EPOCHS } from '../../../src/services/engine/camera/drivers/cameraEpochs';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { hide, hold, show } from '../../../src/services/engine/animation/effectHelpers';
import { APP_VISIBILITY_REGISTRY } from '../../../src/compositions/appVisibility';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import type { Action } from '@reduxjs/toolkit';
import type { Effect } from '../../../src/@types/animation/Effect';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';

const START = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 1 };

// `boot` writes land before seeding, so they set the starting fade. The clip's steps are then
// published on the first tick, at nowMs 0.
function playOnce(steps: readonly Effect[], boot: readonly Action[] = []) {
  const store = configureStore({ reducer: rootReducer });
  for (const action of boot) store.dispatch(action);
  const fades = createFadeRegistry({ requestRender: () => {} });
  const state = {
    settings: store.getState().settings,
    subsystems: { fades, scheduler: { requestRender: vi.fn<() => void>() } },
    visibilityEntries: [...APP_VISIBILITY_REGISTRY],
    visibilityGates: new Map(),
  } as unknown as EngineState;
  seedVisibilityFades(state);
  const player = createClipPlayer({
    store,
    getCameraRuntime: () => {
      throw new Error('no frame roll here');
    },
    extractFocusRow: () => ({ row: null, focusId: null }),
    syncVisibility: (settings, overMs) => syncVisibilityTargets({ ...state, settings }, overMs),
  });
  const data = { start: START, timeline: [...steps, hold(20)] };
  store.dispatch(clipStarted({ data, frame: DEFAULT_ORIENTATION, atEnd: 'revert' }));
  player.tick(UNSTARTED_EPOCHS.clip, 0);
  return fades;
}

describe("a scene step's over reaches the fade registry", () => {
  it('show over 3 s ramps an of label over the same 3 s as its thing', () => {
    const fades = playOnce([show(['constellations'], 3)]);
    for (const address of ['constellations', 'label:constellations'] as const) {
      const mid = fades.opacityOf({ address }, 1500);
      expect(mid).toBeGreaterThan(0.05);
      expect(mid).toBeLessThan(0.95);
    }
  });

  it('hide over 0 lands at 0 at once', () => {
    const fades = playOnce(
      [hide(['flow'], 0)],
      [setVisibility({ cluster: 'flow', field: 'enabled', on: true })],
    );
    expect(fades.opacityOf({ address: 'flow' }, 0)).toBe(0);
  });
});
