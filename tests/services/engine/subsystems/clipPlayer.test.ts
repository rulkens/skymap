/**
 * clipPlayer — unit tests for the side-effecting Resource that owns the clip's
 * scene cues, the `clipOpacity` channel, and clip-completion lifecycle.
 *
 * ### Test strategy
 *
 * All tests use a REAL store (`configureStore({ reducer: rootReducer })`), real
 * `compileClip` (via `createClipPlayer`), real `createClipOpacityChannel`, and
 * real `clipElapsed`. Only `applySceneEffect` is mocked for the routing test —
 * we need to assert it is called for non-fade cues but NOT for fade cues, and
 * module-level mocking is the only TS-safe way to spy on a named export.
 *
 * ### Clock behaviour
 *
 * `clipElapsed` keys on `camera.clip` REFERENCE identity. On the first tick
 * after `clipStarted(data)`, the clock sees a new reference → `clipStartMs = nowMs`,
 * elapsed = 0 s. Subsequent ticks at `nowMs = clipStartMs + N*1000` yield N seconds.
 * So: install the clip, tick at t=0 (elapsed=0, seeds clock), tick at t=N*1000
 * (elapsed=N s). That is the pattern used throughout.
 *
 * ### Two-frame deferred completion
 *
 * On the frame elapsed first reaches durationSec: `pendingEnd` is set but
 * `clipEnded` is NOT dispatched. On the NEXT tick: `clipEnded` IS dispatched and
 * internal state resets. The test "dispatches clipEnded the frame AFTER the clip
 * reaches durationSec" pins this ordering explicitly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { clipStarted, clipEnded, resolveClipStart } from '../../../../src/state/camera/cameraSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { createClipPlayer } from '../../../../src/services/engine/subsystems/clipPlayer';
import { applySceneEffect } from '../../../../src/services/animation/applySceneEffect';
import { fade, hide, seq, hold } from '../../../../src/services/engine/animation/effectHelpers';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// ---------------------------------------------------------------------------
// Module-level mock for applySceneEffect
//
// Using vi.mock (not vi.spyOn) because applySceneEffect is a named function
// export — TypeScript rejects vi.spyOn on ES module named exports in strict
// mode. The hoisted factory pattern makes a typed mock available to test bodies.
// ---------------------------------------------------------------------------

const { mockApplySceneEffect } = vi.hoisted(() => ({
  mockApplySceneEffect:
    vi.fn<typeof import('../../../../src/services/animation/applySceneEffect').applySceneEffect>(),
}));

vi.mock('../../../../src/services/animation/applySceneEffect', () => ({
  applySceneEffect: mockApplySceneEffect,
}));

const mockedApplySceneEffect = vi.mocked(applySceneEffect);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LIVE_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };

type TestStore = ReturnType<typeof makeStore>;

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/** Install a clip into the store at the given start time. */
function installClip(store: TestStore, data: ClipData): ClipData {
  const resolved = resolveClipStart(data, LIVE_POSE);
  store.dispatch(clipStarted({ data: resolved, frame: DEFAULT_ORIENTATION }));
  return resolved;
}

/** Minimal stub EngineState for the getEngineState dep. */
function makeEngineStateStub(): EngineState {
  return {} as unknown as EngineState;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockedApplySceneEffect.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('clipPlayer', () => {
  it('fires a cue when elapsed crosses its atSec', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const requestRender = vi.fn<() => void>();
    const player = createClipPlayer({
      store,
      requestRender,
      clock,
      getEngineState: makeEngineStateStub,
    });

    // Clip: fade(['survey'], 0, 0) at atSec=0 (snap to 0), then hold(5).
    const data: ClipData = {
      timeline: [fade(['survey'], 0, 0), hold(5)],
    };
    installClip(store, data);

    // Tick at t=0: clock seeds clipStartMs=0, elapsed=0.
    // Cue at atSec=0 is in (-Infinity, 0] — fires.
    player.tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    // Second tick at t=0 (same elapsed). prevElapsed is now 0.
    // Cue at atSec=0 is NOT in (0, 0] — does NOT re-fire.
    // requestRender was called once (first tick only).
    player.tick(0);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('fires cues in (prevElapsed, elapsed] across a tick window', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    // Two fade cues: survey at atSec=0, filaments at atSec=3.
    // seq([fade@0, hold(3), fade@3, hold(5)]) — hold(3) advances cursor to 3.
    const data: ClipData = {
      timeline: [seq([fade(['survey'], 0, 0), hold(3), fade(['filaments'], 0, 0), hold(5)])],
    };
    installClip(store, data);

    // Tick 1 at t=0: elapsed=0. prevElapsed=-Inf. Fires cue@0 (survey).
    player.tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);
    expect(player.clipOpacityOf('filaments', 0)).toBe(1); // not yet

    // Tick 2 at t=4000: elapsed=4. prevElapsed=0. Fires cue@3 (filaments) in (0,4].
    player.tick(4000);
    expect(player.clipOpacityOf('survey', 4000)).toBe(0); // still faded
    expect(player.clipOpacityOf('filaments', 4000)).toBe(0); // now faded
  });

  it('dispatches clipEnded the frame AFTER the clip reaches durationSec (post-produce defer)', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    // Simple 2-second clip: hold(2).
    const data: ClipData = { timeline: [hold(2)] };
    installClip(store, data);

    const endClipType = clipEnded().type;

    // Tick 1 at t=0: seeds clock, elapsed=0 (not at duration yet).
    dispatchSpy.mockClear();
    player.tick(0);
    const types1 = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(types1).not.toContain(endClipType);

    // Tick 2 at t=2000: elapsed=2 = durationSec. Sets pendingEnd=true.
    // clipEnded must NOT be dispatched on THIS frame (post-produce safety).
    dispatchSpy.mockClear();
    player.tick(2000);
    const types2 = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(types2).not.toContain(endClipType);
    // Clip is still active — produce step runs evaluateClip at saturation.
    expect(store.getState().camera.clip).not.toBeNull();

    // Tick 3 (any nowMs): pendingEnd was true → dispatches clipEnded NOW.
    dispatchSpy.mockClear();
    player.tick(3000);
    const types3 = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(types3).toContain(endClipType);
    // Clip is now null in the store.
    expect(store.getState().camera.clip).toBeNull();
  });

  it('fade cue drives clipOpacity; clipOpacityOf reflects it; resets to 1 on clipEnded', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    // Clip: fade(['survey'], 0, 0) at t=0 (snap to 0), hold(1). Duration = 1 s.
    const data: ClipData = { timeline: [fade(['survey'], 0, 0), hold(1)] };
    installClip(store, data);

    // Tick 1: elapsed=0, cue fires, survey snaps to 0.
    player.tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    // Tick 2: elapsed=1 = durationSec → pendingEnd set. Clip still active.
    player.tick(1000);
    expect(player.clipOpacityOf('survey', 1000)).toBe(0);

    // Tick 3: pendingEnd was true → clipEnded dispatched → reset() called → all factors back to 1.
    player.tick(2000);
    expect(player.clipOpacityOf('survey', 2000)).toBe(1);
  });

  it('stop dispatches clipEnded and resets the cursor + clipOpacity', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    // Clip with a fade cue; clip is long so it won't complete naturally.
    const data: ClipData = { timeline: [fade(['survey'], 0, 0), hold(60)] };
    installClip(store, data);

    // Tick to fire the fade cue.
    player.tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    // stop() dispatches clipEnded and resets clipOpacity.
    dispatchSpy.mockClear();
    player.stop();

    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(dispatchedTypes).toContain(clipEnded().type);
    // clipOpacity reset → factor back to 1.
    expect(player.clipOpacityOf('survey', 0)).toBe(1);
    // Clip cleared from the store.
    expect(store.getState().camera.clip).toBeNull();
  });

  it('routes a non-fade cue through applySceneEffect; fade cue does NOT call applySceneEffect', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    // Two cues both at atSec=0:
    //   - fade(['survey'], 0, 0): must NOT call applySceneEffect (clipPlayer's own)
    //   - hide(['flow']): MUST call applySceneEffect
    // seq accumulates: fade returns 0 duration (scene cue), hide returns 0.
    // Both at cursor=0 → atSec=0 for both.
    const data: ClipData = {
      timeline: [seq([fade(['survey'], 0, 0), hide(['flow']), hold(5)])],
    };
    installClip(store, data);
    mockedApplySceneEffect.mockClear();

    // Tick at t=0: both cues at atSec=0 fire.
    player.tick(0);

    // hide cue routes through applySceneEffect; fade cue does NOT.
    expect(mockedApplySceneEffect).toHaveBeenCalledTimes(1);
    const calledEffect = mockedApplySceneEffect.mock.calls[0]?.[0];
    expect(calledEffect?.kind).toBe('hide');
  });

  it('destroy resets clipOpacity to 1 and clears internal state', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    const data: ClipData = { timeline: [fade(['survey'], 0, 0), hold(5)] };
    installClip(store, data);

    player.tick(0); // fires fade cue → survey = 0
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    player.destroy();
    // After destroy, clipOpacity is reset — all layers return 1.
    expect(player.clipOpacityOf('survey', 0)).toBe(1);
  });

  it('destroy settles an in-flight playClip end-resolver', () => {
    const store = makeStore();
    const clock = createCameraClock();
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: makeEngineStateStub,
    });

    let settled = false;
    player.registerEndResolver(() => {
      settled = true;
    });

    player.destroy();
    expect(settled).toBe(true);
  });
});
