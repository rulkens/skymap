/**
 * viewBody tests — the three-step body (settings → fly → wait for exit),
 * run directly (not through `runTakeover`, which Task 3's suite already
 * covers) so these assert only what `viewBody` itself is responsible for.
 *
 * A `task.cancel()` call from test code proves nothing about supersede
 * ordering (the scheduler semaphore is 0 there, so queued `put`s flush
 * synchronously against broken code too) — these tests never do that; they
 * only dispatch `exitTakeover`, the real signal `viewBody` waits on.
 */
import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { viewBody } from '../../../src/state/views/viewBody';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { flowSlice } from '../../../src/layers/flow/settings/flowSlice';
import type { View } from '../../../src/@types/views/View';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const VIEW: View = {
  id: 'cosmicFlows',
  label: 'Cosmic Flows',
  settings: { flow: { ...flowSlice.getInitialState(), enabled: true } },
  pose: { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
  body: [{ heading: 'Cosmic Flows', text: 'test' }],
};

function buildStore(playClip: (clip: ClipData) => Promise<void>) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({ playClip });
  return { store, sagaMiddleware };
}

describe('viewBody', () => {
  it('applies the view settings before playing the clip', async () => {
    let flowEnabledAtPlay: boolean | undefined;
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      flowEnabledAtPlay = store.getState().settings.flow.enabled;
      return new Promise<void>(() => {}); // never resolves — asserts fire first
    });
    const { store, sagaMiddleware } = buildStore(playClip);

    sagaMiddleware.run(function* () {
      yield* viewBody(VIEW);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(playClip).toHaveBeenCalledTimes(1);
    expect(flowEnabledAtPlay).toBe(true);
  });

  it('waits for exitTakeover and does not restore on its own', async () => {
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store, sagaMiddleware } = buildStore(playClip);

    const task = sagaMiddleware.run(function* () {
      yield* viewBody(VIEW);
    });
    await new Promise((r) => setTimeout(r, 0));

    // The clip already resolved — viewBody must still be parked on exitTakeover,
    // not returned.
    expect(task.isRunning()).toBe(true);
    expect(store.getState().settings.flow.enabled).toBe(true);

    store.dispatch(exitTakeover());
    await new Promise((r) => setTimeout(r, 0));

    expect(task.isRunning()).toBe(false);
    // viewBody itself never restores — no reason for the setting to flip back
    // as a side effect of exitTakeover; runTakeover (untested here) owns that.
    expect(store.getState().settings.flow.enabled).toBe(true);
  });
});
