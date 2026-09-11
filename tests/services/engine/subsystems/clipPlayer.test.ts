/**
 * clipPlayer — unit tests for the side-effecting Resource that owns the clip's
 * scene cues, the `clipOpacity` channel, and clip-completion lifecycle.
 *
 * ### Test strategy
 *
 * All tests use a REAL store (`configureStore({ reducer: rootReducer })`), real
 * `compileClip` (via `createClipPlayer`), real `createClipOpacityChannel`, and
 * the real epoch primitives. Only `applySceneEffect` is mocked for the routing
 * test — we need to assert it is called for non-fade cues but NOT for fade
 * cues, and module-level mocking is the only TS-safe way to spy on a named
 * export.
 *
 * ### Epoch behaviour
 *
 * `tick(clipEpoch, nowMs)` advances the epoch it is handed against
 * `camera.clip` REFERENCE identity and returns it. On the first tick after
 * `clipStarted(data)` the ref is new → `startMs = nowMs`, elapsed = 0 s.
 * Subsequent ticks at `nowMs = startMs + N*1000` yield N seconds. `makePlayer`
 * threads the returned epoch back in, the way `runFrame` does through
 * `cameraRuntime.epochs.clip`.
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
import { UNSTARTED_EPOCHS, elapsedMs } from '../../../../src/services/engine/camera/cameraEpochs';
import { createClipPlayer } from '../../../../src/services/engine/subsystems/clipPlayer';
import { applySceneEffect } from '../../../../src/services/animation/applySceneEffect';
import { fade, hide, seq, hold } from '../../../../src/services/engine/animation/effectHelpers';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraEpochs } from '../../../../src/@types/engine/camera/CameraEpochs';
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

/**
 * A player plus a `tick(nowMs)` that threads the returned clip epoch back into
 * the next call — the frame's job, done here so tests read like the old
 * single-argument API.
 */
function makePlayer(store: TestStore, requestRender: () => void = () => {}) {
  const player = createClipPlayer({ store, requestRender, getEngineState: makeEngineStateStub });
  let epoch: CameraEpochs['clip'] = UNSTARTED_EPOCHS.clip;
  const tick = (nowMs: number): CameraEpochs['clip'] => {
    epoch = player.tick(epoch, nowMs).clipEpoch;
    return epoch;
  };
  return { player, tick };
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
    const requestRender = vi.fn<() => void>();
    const { player, tick } = makePlayer(store, requestRender);

    // Clip: fade(['survey'], 0, 0) at atSec=0 (snap to 0), then hold(5).
    const data: ClipData = {
      timeline: [fade(['survey'], 0, 0), hold(5)],
    };
    installClip(store, data);

    // Tick at t=0: the epoch starts at 0, elapsed=0.
    // Cue at atSec=0 is in (-Infinity, 0] — fires.
    tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    // Second tick at t=0 (same elapsed). prevElapsed is now 0.
    // Cue at atSec=0 is NOT in (0, 0] — does NOT re-fire.
    // requestRender was called once (first tick only).
    tick(0);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('fires cues in (prevElapsed, elapsed] across a tick window', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);

    // Two fade cues: survey at atSec=0, filaments at atSec=3.
    // seq([fade@0, hold(3), fade@3, hold(5)]) — hold(3) advances cursor to 3.
    const data: ClipData = {
      timeline: [seq([fade(['survey'], 0, 0), hold(3), fade(['filaments'], 0, 0), hold(5)])],
    };
    installClip(store, data);

    // Tick 1 at t=0: elapsed=0. prevElapsed=-Inf. Fires cue@0 (survey).
    tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);
    expect(player.clipOpacityOf('filaments', 0)).toBe(1); // not yet

    // Tick 2 at t=4000: elapsed=4. prevElapsed=0. Fires cue@3 (filaments) in (0,4].
    tick(4000);
    expect(player.clipOpacityOf('survey', 4000)).toBe(0); // still faded
    expect(player.clipOpacityOf('filaments', 4000)).toBe(0); // now faded
  });

  it('dispatches clipEnded the frame AFTER the clip reaches durationSec (post-produce defer)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { tick } = makePlayer(store);

    // Simple 2-second clip: hold(2).
    const data: ClipData = { timeline: [hold(2)] };
    installClip(store, data);

    const endClipType = clipEnded().type;

    // Tick 1 at t=0: starts the epoch, elapsed=0 (not at duration yet).
    dispatchSpy.mockClear();
    tick(0);
    const types1 = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(types1).not.toContain(endClipType);

    // Tick 2 at t=2000: elapsed=2 = durationSec. Sets pendingEnd=true.
    // clipEnded must NOT be dispatched on THIS frame (post-produce safety).
    dispatchSpy.mockClear();
    tick(2000);
    const types2 = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(types2).not.toContain(endClipType);
    // Clip is still active — produce step runs evaluateClip at saturation.
    expect(store.getState().camera.clip).not.toBeNull();

    // Tick 3 (any nowMs): pendingEnd was true → dispatches clipEnded NOW.
    dispatchSpy.mockClear();
    tick(3000);
    const types3 = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(types3).toContain(endClipType);
    // Clip is now null in the store.
    expect(store.getState().camera.clip).toBeNull();
  });

  it('fade cue drives clipOpacity; clipOpacityOf reflects it; resets to 1 on clipEnded', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);

    // Clip: fade(['survey'], 0, 0) at t=0 (snap to 0), hold(1). Duration = 1 s.
    const data: ClipData = { timeline: [fade(['survey'], 0, 0), hold(1)] };
    installClip(store, data);

    // Tick 1: elapsed=0, cue fires, survey snaps to 0.
    tick(0);
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    // Tick 2: elapsed=1 = durationSec → pendingEnd set. Clip still active.
    tick(1000);
    expect(player.clipOpacityOf('survey', 1000)).toBe(0);

    // Tick 3: pendingEnd was true → clipEnded dispatched → reset() called → all factors back to 1.
    tick(2000);
    expect(player.clipOpacityOf('survey', 2000)).toBe(1);
  });

  it('stop dispatches clipEnded and resets the cursor + clipOpacity', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { player, tick } = makePlayer(store);

    // Clip with a fade cue; clip is long so it won't complete naturally.
    const data: ClipData = { timeline: [fade(['survey'], 0, 0), hold(60)] };
    installClip(store, data);

    // Tick to fire the fade cue.
    tick(0);
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

  it('loop: true rewinds the epoch + cue cursor instead of ending; a top-of-timeline cue re-fires each lap; stop still terminates it', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { player, tick } = makePlayer(store);

    // A 2-second looping clip with a scene cue at atSec=0. `hide` routes
    // through applySceneEffect (mocked), so its call count proves whether the
    // cue actually re-fires on a second lap, not just whether elapsed wraps.
    const data: ClipData = { timeline: [hide(['flow']), hold(2)], loop: true };
    installClip(store, data);
    mockedApplySceneEffect.mockClear();

    const endClipType = clipEnded().type;

    // Lap 1, t=0: elapsed=0, cue fires once.
    tick(0);
    expect(mockedApplySceneEffect).toHaveBeenCalledTimes(1);

    // t=2000: elapsed=2=durationSec. A non-looping clip would set pendingEnd
    // here; a looping one rewinds instead — no clipEnded, clip stays active.
    dispatchSpy.mockClear();
    tick(2000);
    const typesAtWrap = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(typesAtWrap).not.toContain(endClipType);
    expect(store.getState().camera.clip).not.toBeNull();

    // Lap 2, t=2100 (100ms into the rebased epoch ⇒ wrapped elapsed ≈ 0.1s):
    // the atSec=0 cue is back in (prevElapsed, elapsed] and fires again —
    // proof the cue cursor rewound alongside the epoch, not just one of them.
    tick(2100);
    expect(mockedApplySceneEffect).toHaveBeenCalledTimes(2);

    // Many more laps still never end the clip on their own.
    dispatchSpy.mockClear();
    tick(4000);
    tick(4100);
    const typesAfterMoreLaps = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(typesAfterMoreLaps).not.toContain(endClipType);
    expect(store.getState().camera.clip).not.toBeNull();

    // Only stop() ends a looping clip.
    dispatchSpy.mockClear();
    player.stop();
    const typesAfterStop = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    expect(typesAfterStop).toContain(endClipType);
    expect(store.getState().camera.clip).toBeNull();
  });

  it("a looping clip's rewind returns a rebased epoch, not a mutated one", () => {
    const store = makeStore();
    const { player } = makePlayer(store);
    installClip(store, { timeline: [hold(2)], loop: true });

    // Same ref on the wrap frame ⇒ `advanceEpoch` hands back THIS object, so a
    // write-in-place rebase would show up as a mutated input.
    const started = player.tick(UNSTARTED_EPOCHS.clip, 0).clipEpoch;
    const snapshot = { ...started };

    // t=2100: 0.1 s past the 2 s lap. Rebased = now − overshoot, not snapped to now.
    const { clipEpoch } = player.tick(started, 2100);

    expect(clipEpoch).not.toBe(started);
    expect(clipEpoch.ref).toBe(started.ref);
    expect(clipEpoch.startMs).toBeCloseTo(2000, 6);
    expect(started).toEqual(snapshot);
  });

  it("tick starts the epoch on the clip's arrival frame", () => {
    const store = makeStore();
    const { player } = makePlayer(store);
    installClip(store, { timeline: [hold(5)] });

    const { clipEpoch } = player.tick(UNSTARTED_EPOCHS.clip, 5000);

    expect(clipEpoch.ref).toBe(store.getState().camera.clip);
    expect(elapsedMs(clipEpoch, 5000)).toBe(0);
  });

  it('the player holds no reference to the runtime', () => {
    // The engine state the player can reach carries its own (stale) epochs;
    // replacing `cameraRuntime` wholesale must not change what `tick` returns —
    // the epoch is the argument's, advanced, and nothing else.
    const store = makeStore();
    const engineState = {
      cameraRuntime: { epochs: UNSTARTED_EPOCHS },
    } as unknown as EngineState;
    const player = createClipPlayer({
      store,
      requestRender: () => {},
      getEngineState: () => engineState,
    });
    installClip(store, { timeline: [hold(5)] });
    const handed: CameraEpochs['clip'] = { ref: store.getState().camera.clip, startMs: 1000 };

    engineState.cameraRuntime = {
      epochs: { ...UNSTARTED_EPOCHS, clip: { ref: store.getState().camera.clip, startMs: 0 } },
    } as unknown as EngineState['cameraRuntime'];
    const { clipEpoch } = player.tick(handed, 1500);

    expect(clipEpoch).toBe(handed);
    expect(elapsedMs(clipEpoch, 1500)).toBe(500);
  });

  it('routes a non-fade cue through applySceneEffect; fade cue does NOT call applySceneEffect', () => {
    const store = makeStore();
    const { tick } = makePlayer(store);

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
    tick(0);

    // hide cue routes through applySceneEffect; fade cue does NOT.
    expect(mockedApplySceneEffect).toHaveBeenCalledTimes(1);
    const calledEffect = mockedApplySceneEffect.mock.calls[0]?.[0];
    expect(calledEffect?.kind).toBe('hide');
  });

  it('destroy resets clipOpacity to 1 and clears internal state', () => {
    const store = makeStore();
    const { player, tick } = makePlayer(store);

    const data: ClipData = { timeline: [fade(['survey'], 0, 0), hold(5)] };
    installClip(store, data);

    tick(0); // fires fade cue → survey = 0
    expect(player.clipOpacityOf('survey', 0)).toBe(0);

    player.destroy();
    // After destroy, clipOpacity is reset — all layers return 1.
    expect(player.clipOpacityOf('survey', 0)).toBe(1);
  });

  it('destroy settles an in-flight playClip end-resolver', () => {
    const store = makeStore();
    const { player } = makePlayer(store);

    let settled = false;
    player.registerEndResolver(() => {
      settled = true;
    });

    player.destroy();
    expect(settled).toBe(true);
  });
});
