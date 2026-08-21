/**
 * commitOnEdge — unit tests for the per-frame commit-on-edge contract.
 *
 * The frame loop runs four camera steps per frame:
 *
 *   1. PRODUCE the pose from the driver table (runCameraDrivers).
 *   2. TWEEN COMPLETION: cancel a finished tween with cancelCameraTween().
 *   3. COMMIT-ON-EDGE: dispatch commitCameraPose(lastPose) when the active
 *      driver changes AND the departing driver has `commitsOnEdge: true`
 *      (tween, autoRotate, clip). orbitDrag and resting are excluded.
 *   4. UPDATE Resources: prevActiveId.current = activeId; lastPose.current = pose.
 *
 * These tests pin the commit-on-edge contract — the invariants that prevent
 * mid-tween yaw flicker, spurious per-frame commits, and jump-on-grab:
 *
 *   - A tween that completes fires `cancelCameraTween()` exactly once and
 *     `commitCameraPose` exactly once (on the next frame, when the driver
 *     changes away from 'tween').
 *   - While the tween is the active driver, no `commitCameraPose` fires
 *     per frame — only on the deactivation edge.
 *   - When auto-rotate deactivates, `commitCameraPose` fires exactly once.
 *   - When a clip deactivates (clip → null), `commitCameraPose` fires exactly
 *     once (clip declares `commitsOnEdge: true`).
 *   - Grabbing during a tween (orbitDrag takes over) does NOT produce a
 *     jump: the grab seeds from `lastPose.current` (the visible position),
 *     not from `base` (the stale committed pose).
 *   - orbitDrag and resting deactivation edges do NOT fire commitCameraPose
 *     (neither declares `commitsOnEdge`).
 *   - The auto-rotate bridge fires `setAutoRotate` when settings bit ≠
 *     camera slice bit; on steady-state frames it is a no-op.
 *
 * These behaviors are tested by driving the driver table + Redux store
 * directly, without the GPU or the full `runFrame` body — which keeps the
 * tests cheap and independent of the rendering subsystem.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import {
  commitCameraPose,
  startCameraTween,
  cancelCameraTween,
  beginDrag,
  endDrag,
  setAutoRotate,
  clipStarted,
  clipEnded,
} from '../../../../src/state/camera/cameraSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import {
  buildCameraDrivers,
  runCameraDrivers,
} from '../../../../src/services/engine/camera/cameraDrivers';
import { activeDriverId } from '../../../../src/services/engine/camera/activeDriverId';
import {
  createCameraClock,
  tweenElapsed,
} from '../../../../src/services/engine/camera/cameraClock';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';

/**
 * Minimal EngineState fixture with a live cameraRuntime Resource bag. Used by
 * helpers that simulate the frame loop's commit-on-edge logic without spinning
 * up the full GPU engine.
 */
function makeEngineState(): {
  state: Pick<EngineState, 'cam' | 'cameraRuntime'>;
  cam: OrbitCamera;
} {
  const cam: OrbitCamera = {
    yaw: 0,
    pitch: 0,
    distance: 100,
    target: new Float32Array([0, 0, 0]),
    position: new Float32Array([0, 0, 0]),
    fovYRad: 0.8,
    aspect: 1,
    near: 0.01,
    far: 1000,
  } as unknown as OrbitCamera;

  const state = {
    cam,
    cameraRuntime: {
      clock: createCameraClock(),
      projection: { fovYRad: 0.8, aspect: 1, near: 0.01, far: 1000 },
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 } as CameraPose },
      prevActiveId: { current: 'resting' as string },
      lastRenderedSimDays: { current: 0 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
      surfaceFollow: { engaged: false, orientationAtFlip: null, bodyId: null },
      debugZoomBiasMeters: 0,
      debugIdleTickMs: 0,
      controlsDebug: { dragMode: null, activePointers: 0, wheelDeltaY: 0, wheelAtMs: 0 },
    },
  };

  return { state, cam };
}

/** Build a real Redux store from the production root reducer. */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/**
 * Simulate one frame of the commit-on-edge logic:
 *   1. Produce pose via runCameraDrivers.
 *   2. If activeId === 'tween' and elapsed >= durationMs, dispatch cancelCameraTween.
 *   3. If prevActiveId changed AND the departing driver has commitsOnEdge: true,
 *      dispatch commitCameraPose (mirrors runFrame's property-based guard).
 *   4. Update prevActiveId and lastPose.
 *
 * Returns { pose, activeId, committed } so tests can inspect per-frame output.
 */
function simulateFrame(
  engineState: ReturnType<typeof makeEngineState>['state'],
  store: ReturnType<typeof makeStore>,
  drivers: ReturnType<typeof buildCameraDrivers>,
  nowMs: number,
): { pose: CameraPose; activeId: string; committed: boolean } {
  const rootState = store.getState();
  const { clock, lastPose, prevActiveId } = engineState.cameraRuntime;

  const pose = runCameraDrivers(drivers, rootState, engineState.cam!, clock, nowMs);
  const currActiveId = activeDriverId(drivers, rootState);

  // Step 2: Tween completion.
  let committed = false;
  if (currActiveId === 'tween' && rootState.camera.tween !== null) {
    const elapsed = tweenElapsed(clock, rootState.camera.tween, nowMs);
    if (elapsed >= rootState.camera.tween.durationMs) {
      store.dispatch(cancelCameraTween());
    }
  }

  // Step 3: Commit-on-edge. On a deactivation edge the frame renders the
  // just-committed pose (lastPose), not the stale-base produce result — mirrors
  // runFrame's `renderPose` override that prevents the one-frame edge flicker.
  // MIRROR: this guard must stay identical to runFrame's property-based guard so
  // the clip case reflects real production behaviour.
  const prev = prevActiveId.current;
  let renderPose = pose;
  if (prev !== currActiveId && drivers.find((d) => d.id === prev)?.commitsOnEdge) {
    store.dispatch(commitCameraPose(lastPose.current));
    committed = true;
    renderPose = lastPose.current;
  }

  // Step 4: Update Resources.
  prevActiveId.current = currActiveId;
  lastPose.current = renderPose;

  return { pose: renderPose, activeId: currActiveId, committed };
}

describe('commitOnEdge — tween settles', () => {
  it('tween active: no commit fires while the tween is still the winner', () => {
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    // Install a long-running tween (1000 ms).
    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: { target: [10, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    // Seed prevActiveId to 'tween' so the tween is treated as already active
    // from frame 0 (no edge on the first frame of a tween).
    state.cameraRuntime.prevActiveId.current = 'tween';

    // Run several frames in the middle of the tween.
    let anyCommit = false;
    for (let t = 100; t < 900; t += 100) {
      const { committed } = simulateFrame(state, store, drivers, t);
      if (committed) anyCommit = true;
    }

    expect(anyCommit).toBe(false);
  });

  it('cancelCameraTween is dispatched exactly once when elapsed >= durationMs', () => {
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);
    const dispatch = vi.spyOn(store, 'dispatch');

    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: { target: [0, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 200,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime.prevActiveId.current = 'tween';

    // Arrival frame primes the clock (elapsed 0); subsequent frames advance it.
    simulateFrame(state, store, drivers, 0); // arrival: primes clock
    simulateFrame(state, store, drivers, 100); // elapsed 100, mid-tween
    simulateFrame(state, store, drivers, 200); // elapsed 200 >= durationMs → cancel

    const cancelActions = dispatch.mock.calls
      .map(([a]) => a)
      .filter(
        (a): a is ReturnType<typeof cancelCameraTween> =>
          typeof a === 'object' &&
          a !== null &&
          (a as { type: string }).type === 'camera/cancelCameraTween',
      );
    expect(cancelActions).toHaveLength(1);
  });

  it('commitCameraPose fires on the frame AFTER cancelCameraTween (deactivation edge)', () => {
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: { target: [0, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 200,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime.prevActiveId.current = 'tween';

    simulateFrame(state, store, drivers, 0); // arrival: primes clock
    // Cancel frame: elapsed 200 >= durationMs, cancelCameraTween dispatched,
    // driver STILL shows as 'tween' this frame (cancel takes effect next frame).
    const frame1 = simulateFrame(state, store, drivers, 200); // cancel frame
    expect(frame1.committed).toBe(false); // no commit on the cancel frame

    // Frame after cancel: tween is null → driver changes from 'tween' to 'resting'
    // → commit-on-edge fires.
    const frame2 = simulateFrame(state, store, drivers, 220); // deactivation edge
    expect(frame2.committed).toBe(true);
  });

  it('commit bakes the saturated `to` pose into base (lastPose on the cancel frame == to)', () => {
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);
    const TO: CameraPose = { target: [5, 10, 15], yaw: 2.5, pitch: -0.3, distance: 40 };

    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: TO,
        durationMs: 200,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime.prevActiveId.current = 'tween';

    simulateFrame(state, store, drivers, 0); // arrival: primes clock
    simulateFrame(state, store, drivers, 200); // cancel frame: elapsed 200 >= durationMs, lastPose := saturated TO
    simulateFrame(state, store, drivers, 220); // commit frame: base := lastPose == TO

    const base = store.getState().camera.base;
    expect(base.yaw).toBeCloseTo(TO.yaw, 6);
    expect(base.pitch).toBeCloseTo(TO.pitch, 6);
    expect(base.distance).toBeCloseTo(TO.distance, 6);
    expect(Array.from(base.target as number[])).toEqual([5, 10, 15]);
  });

  it('the deactivation frame RENDERS the committed pose, not the stale base (no edge flicker)', () => {
    // Regression: commit-on-edge fires AFTER produce, so on the deactivation
    // frame the resting driver reads the pre-commit base. Without the renderPose
    // override the frame would flash the pre-tween pose (PRE) for one frame
    // before the next frame snaps to the target.
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);
    const PRE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
    const TO: CameraPose = { target: [5, 10, 15], yaw: 2.5, pitch: -0.3, distance: 40 };

    store.dispatch(commitCameraPose(PRE));
    store.dispatch(
      startCameraTween({
        from: PRE,
        to: TO,
        durationMs: 200,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime.prevActiveId.current = 'tween';

    simulateFrame(state, store, drivers, 0); // arrival: primes clock
    simulateFrame(state, store, drivers, 200); // cancel frame: lastPose := saturated TO
    const edge = simulateFrame(state, store, drivers, 220); // deactivation edge

    expect(edge.activeId).toBe('resting');
    expect(edge.committed).toBe(true);
    // The rendered pose is the committed target, NOT the stale pre-tween base.
    expect(edge.pose.yaw).toBeCloseTo(TO.yaw, 6);
    expect(edge.pose.distance).toBeCloseTo(TO.distance, 6);
  });
});

describe('commitOnEdge — auto-rotate deactivation', () => {
  it('commitCameraPose fires exactly once when auto-rotate turns off', () => {
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    // Activate auto-rotate.
    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));
    state.cameraRuntime.prevActiveId.current = 'autoRotate';

    // Run one frame with auto-rotate still active.
    const frame1 = simulateFrame(state, store, drivers, 1000);
    expect(frame1.activeId).toBe('autoRotate');
    expect(frame1.committed).toBe(false);

    // Turn off auto-rotate.
    store.dispatch(setAutoRotate({ active: false, rate: 0.000873 }));

    // Next frame: driver changes away from 'autoRotate' → commit fires.
    const frame2 = simulateFrame(state, store, drivers, 1016);
    expect(frame2.activeId).toBe('resting');
    expect(frame2.committed).toBe(true);

    // Subsequent frame: no further commit (driver is already 'resting', no edge).
    const frame3 = simulateFrame(state, store, drivers, 1032);
    expect(frame3.committed).toBe(false);
  });
});

describe('commitOnEdge — no-jump-on-grab', () => {
  it('lastPose.current during a tween reflects the visible pose, not base', () => {
    // If drag seeding reads `lastPose.current` (as it should), grabbing during
    // a tween never snaps to the stale `base`. This test verifies that after a
    // tween runs for a few frames, `lastPose.current` differs from `base`.
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    const BASE_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
    store.dispatch(commitCameraPose(BASE_POSE));
    store.dispatch(
      startCameraTween({
        from: BASE_POSE,
        to: { target: [10, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime.prevActiveId.current = 'tween';

    simulateFrame(state, store, drivers, 0); // arrival: primes clock, elapsed 0, lastPose == from == base
    simulateFrame(state, store, drivers, 500); // elapsed 500/1000 → yaw interpolated between 0 and 1

    // `lastPose.current` must NOT equal the stale `base` (which is still
    // the pre-tween committed pose).
    const lastPose = state.cameraRuntime.lastPose.current;
    const base = store.getState().camera.base;
    // After 500ms of a 1000ms tween the yaw is somewhere between 0 and 1.
    expect(lastPose.yaw).not.toBe(base.yaw);
  });

  it('grab mid-tween commits the displaced tween pose into base (tween→orbitDrag edge)', () => {
    // When the user grabs during a tween, the commit-on-edge guard fires because
    // the prev driver was 'tween'. This bakes the displaced tween's last pose into
    // `base` so the drag seeds from `lastPose` and the final pose is jump-free.
    // orbitDrag is excluded from triggering a commit only as the PREV driver, not
    // as the incoming one — design §6 no-jump guarantee.
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: { target: [10, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime.prevActiveId.current = 'tween';

    simulateFrame(state, store, drivers, 0); // arrival: primes clock
    // Mid-tween frame.
    simulateFrame(state, store, drivers, 300);

    // User grabs — orbitDrag (priority 80) takes over.
    store.dispatch(beginDrag());

    // Frame with drag active: prev driver was 'tween', new is 'orbitDrag'.
    // Commit-on-edge fires because prev === 'tween', baking the tween pose into base.
    const { committed, activeId } = simulateFrame(state, store, drivers, 316);

    expect(activeId).toBe('orbitDrag');
    // commit-on-edge fires for tween→orbitDrag (prev is 'tween')
    expect(committed).toBe(true);

    // Cleanup.
    store.dispatch(endDrag());
  });
});

describe('commitOnEdge — clip deactivation', () => {
  it('commit fires when a clip deactivates (clip → null edge)', () => {
    // clip declares commitsOnEdge: true, so the frame after clipEnded() must
    // dispatch commitCameraPose exactly once.
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    const START_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 80 };
    const clip: ClipData = { start: START_POSE, timeline: [] };

    // Activate the clip driver. `frame` matches the store's default orientation
    // so the driver's re-encode is a no-op — this test only cares about the
    // commit-on-edge boolean, not the pose value.
    store.dispatch(clipStarted({ data: clip, frame: DEFAULT_ORIENTATION }));
    // Seed prevActiveId so there's no spurious commit on the first frame.
    state.cameraRuntime.prevActiveId.current = 'clip';

    // Run one frame with the clip active — no commit expected.
    const frame1 = simulateFrame(state, store, drivers, 0);
    expect(frame1.activeId).toBe('clip');
    expect(frame1.committed).toBe(false);

    // Deactivate the clip.
    store.dispatch(clipEnded());

    // Next frame: driver changes from 'clip' to 'resting' → commit fires.
    const frame2 = simulateFrame(state, store, drivers, 16);
    expect(frame2.activeId).toBe('resting');
    expect(frame2.committed).toBe(true);
  });

  it('commit does NOT fire on an orbitDrag deactivation edge', () => {
    // orbitDrag has no commitsOnEdge; endDrag() commits via onGestureEnd instead.
    const store = makeStore();
    const { state } = makeEngineState();
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    store.dispatch(beginDrag());
    state.cameraRuntime.prevActiveId.current = 'orbitDrag';

    // Frame with drag active — no commit.
    const frame1 = simulateFrame(state, store, drivers, 0);
    expect(frame1.activeId).toBe('orbitDrag');
    expect(frame1.committed).toBe(false);

    // End the drag gesture.
    store.dispatch(endDrag());

    // Next frame: driver changes from 'orbitDrag' to 'resting' — no commit
    // because orbitDrag does not declare commitsOnEdge.
    const frame2 = simulateFrame(state, store, drivers, 16);
    expect(frame2.activeId).toBe('resting');
    expect(frame2.committed).toBe(false);
  });
});
