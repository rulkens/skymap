/**
 * exhibitBodySaga tests — settings, then a fly racing `exitTakeover`, then a steady
 * wait for it — run directly (not through `runTakeover`, which Task 3's suite
 * already covers) so these assert only what `exhibitBodySaga` itself is responsible
 * for.
 *
 * A `task.cancel()` call from test code proves nothing about supersede
 * ordering (the scheduler semaphore is 0 there, so queued `put`s flush
 * synchronously against broken code too) — these tests never do that; they
 * only dispatch `exitTakeover`, the real signal `exhibitBodySaga` waits on.
 */
import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { exhibitBodySaga } from '../../../src/state/exhibits/exhibitBodySaga';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { EARTH_REF } from '../../../src/data/selection/earthRef';
import { initialState as flowInitialState } from '../../../src/layers/flow/state/flow/initialState';
import type { Exhibit } from '../../../src/@types/exhibits/Exhibit';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { LiveCameraRuntime } from '../../../src/store/types';

const EXHIBIT: Exhibit = {
  id: 'cosmicFlows',
  label: 'Cosmic Flows',
  settings: { flow: { ...flowInitialState, enabled: true } },
  pose: { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
  lede: 'test',
  body: [{ kind: 'prose', heading: 'Cosmic Flows', text: 'test' }],
};

// Pre-bootstrap by default (`cameraRuntime` returns null), matching production
// before `wireInput` has built a camera — `exhibitBodySaga` must fall through to the
// authored pose rather than throw. Tests exercising the fit-radius path pass
// their own `cameraRuntime`.
function buildStore(
  playClip: (clip: ClipData) => Promise<void>,
  cameraRuntime: () => LiveCameraRuntime | null = () => null,
) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.setContext({ playClip, cameraRuntime });
  return { store, sagaMiddleware };
}

describe('exhibitBodySaga', () => {
  it('applies the exhibit settings before playing the clip', async () => {
    let flowEnabledAtPlay: boolean | undefined;
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      flowEnabledAtPlay = store.getState().settings.flow.enabled;
      return new Promise<void>(() => {}); // never resolves — asserts fire first
    });
    const { store, sagaMiddleware } = buildStore(playClip);

    sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(EXHIBIT);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(playClip).toHaveBeenCalledTimes(1);
    expect(flowEnabledAtPlay).toBe(true);
  });

  it('clears the focus slot before the fly starts', async () => {
    // The boot home seeds Earth into focus, and Earth is a body the sim clock
    // moves — so `followApproach`@55 stays live under the clip@95 driver and
    // wins the frame the clip ends on, easing the camera off the exhibit's pose.
    // Clearing AFTER the clip started would be too late: the follow row reads
    // the slot every frame, so the assert is taken at play time.
    let focusAtPlay: unknown;
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation(() => {
      focusAtPlay = store.getState().selection.focus;
      return new Promise<void>(() => {});
    });
    const { store, sagaMiddleware } = buildStore(playClip);
    store.dispatch(updateSelectionFocus(EARTH_REF));
    expect(store.getState().selection.focus).toEqual(EARTH_REF);

    sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(EXHIBIT);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(focusAtPlay).toBeNull();
  });

  it('waits for exitTakeover and does not restore on its own', async () => {
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store, sagaMiddleware } = buildStore(playClip);

    const task = sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(EXHIBIT);
    });
    await new Promise((r) => setTimeout(r, 0));

    // The clip already resolved — exhibitBodySaga must still be parked on exitTakeover,
    // not returned.
    expect(task.isRunning()).toBe(true);
    expect(store.getState().settings.flow.enabled).toBe(true);

    store.dispatch(exitTakeover());
    await new Promise((r) => setTimeout(r, 0));

    expect(task.isRunning()).toBe(false);
    // exhibitBodySaga itself never restores — no reason for the setting to flip back
    // as a side effect of exitTakeover; runTakeover (untested here) owns that.
    expect(store.getState().settings.flow.enabled).toBe(true);
  });

  it('drifts during the hold and hands the spin back on exit', async () => {
    // `camera.autoRotate` is NOT in runTakeover's scene snapshot, so a leak
    // here leaves the viewer's camera turning for the rest of the session.
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store, sagaMiddleware } = buildStore(playClip);
    const before = store.getState().camera.autoRotate;
    expect(before.active).toBe(false);

    sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(EXHIBIT);
    });
    await new Promise((r) => setTimeout(r, 0));

    const held = store.getState().camera.autoRotate;
    expect(held.active).toBe(true);
    // Slower than the slice default, or it is a spin the viewer asked for
    // rather than the exhibit's own ambient drift. Magnitude, not sign: the
    // exhibit drifts the way the fly-in's pivot was already going, which is
    // negative.
    expect(Math.abs(held.rate)).toBeLessThan(Math.abs(before.rate));
    expect(held.rate).not.toBe(0);

    store.dispatch(exitTakeover());
    await new Promise((r) => setTimeout(r, 0));

    expect(store.getState().camera.autoRotate).toEqual(before);
  });

  it('hands the spin back when the takeover is superseded mid-hold', async () => {
    // Supersede cancels the body from outside rather than dispatching
    // exitTakeover — the restore rides a `finally` so both paths wind back.
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined);
    const { store, sagaMiddleware } = buildStore(playClip);
    const before = store.getState().camera.autoRotate;

    const task = sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(EXHIBIT);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().camera.autoRotate.active).toBe(true);

    task.cancel();
    await new Promise((r) => setTimeout(r, 0));

    expect(store.getState().camera.autoRotate).toEqual(before);
  });

  it('re-derives pose.distance from fitRadiusMpc against the live runtime', async () => {
    // A landscape aspect and a known FOV make the expected distance
    // computable by hand: sphereFitDistance's own tests own the formula, this
    // only asserts exhibitBodySaga actually threads the live runtime into it instead
    // of flying the authored fallback.
    const fitExhibit: Exhibit = { ...EXHIBIT, fitRadiusMpc: 14300 };
    let flownDistance: number | undefined;
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation((clip) => {
      const dolly = clip.timeline[0] as { children: { to: number }[] };
      flownDistance = dolly.children[0]!.to;
      return Promise.resolve();
    });
    const cameraRuntime = (): LiveCameraRuntime => ({
      from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
      fovYRad: (Math.PI / 180) * 60,
      aspect: 16 / 9,
      upBasisQuat: [0, 0, 0, 1],
    });
    const { sagaMiddleware } = buildStore(playClip, cameraRuntime);

    sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(fitExhibit);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(flownDistance).not.toBe(fitExhibit.pose.distance);
    // The whole shell must clear the frustum: distance is well beyond the
    // authored 0.14 Mpc fallback for a 14 300 Mpc fit radius.
    expect(flownDistance).toBeGreaterThan(1000);
  });

  it('falls through to the authored pose.distance when the runtime is not ready', async () => {
    const fitExhibit: Exhibit = { ...EXHIBIT, fitRadiusMpc: 14300 };
    let flownDistance: number | undefined;
    const playClip = vi.fn<(clip: ClipData) => Promise<void>>().mockImplementation((clip) => {
      const dolly = clip.timeline[0] as { children: { to: number }[] };
      flownDistance = dolly.children[0]!.to;
      return Promise.resolve();
    });
    const { sagaMiddleware } = buildStore(playClip); // default cameraRuntime returns null

    sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(fitExhibit);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(flownDistance).toBe(fitExhibit.pose.distance);
  });

  it('exits during the fly-in without waiting for it to land', async () => {
    // The fly never lands — against the sequential shape, `exhibitBodySaga` would be
    // stuck inside `yield* call(playClip, ...)` forever, and the exitTakeover
    // dispatch below would find nothing listening yet.
    const playClip = vi
      .fn<(clip: ClipData) => Promise<void>>()
      .mockImplementation(() => new Promise<void>(() => {}));
    const { store, sagaMiddleware } = buildStore(playClip);

    const task = sagaMiddleware.run(function* () {
      yield* exhibitBodySaga(EXHIBIT);
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(playClip).toHaveBeenCalledTimes(1);
    expect(task.isRunning()).toBe(true); // still mid-fly

    store.dispatch(exitTakeover());
    await new Promise((r) => setTimeout(r, 0));

    // Fails against the sequential shape: the never-resolving fly call means
    // `exhibitBodySaga` never reaches a `take(exitTakeover)` to catch this dispatch,
    // so the task would still be running here.
    expect(task.isRunning()).toBe(false);
  });
});
