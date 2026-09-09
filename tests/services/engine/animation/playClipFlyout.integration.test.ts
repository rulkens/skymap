/**
 * playClipFlyout — integration test for the full playClip→clipPlayer→clip@95
 * driver→commit-on-edge seam, driven by the `flyout` ClipData.
 *
 * ### What this tests (and what it does NOT test)
 *
 * This file validates the SEAM: the handshake between dispatch, frames, and
 * the two-frame deferred endClip → commit-on-edge bake → Promise resolution.
 * It does NOT test the evaluator math — Plan A's `evaluateClip.test.ts` owns
 * that. Here we only care that:
 *
 *   1. Camera distance MOVES from the live start pose toward the flyout's
 *      horizon-shell target (29 500 Mpc) as frames advance.
 *   2. The Promise from `playClip(flyout)` RESOLVES after the timeline duration.
 *   3. `camera.base` is committed to the saturated final pose (distance ≈ 29 500)
 *      via the commit-on-edge bake — not a one-frame-stale pose.
 *
 * ### Frame schedule
 *
 * The flyout duration is 22 seconds. We drive coarse 1-second steps:
 *
 *   T0      = 0 ms    — arrival frame: clipPlayer.tick primes the clock (elapsed 0).
 *             clip@95 active, pose == live start distance (100 Mpc).
 *
 *   T_early = 2000 ms — sampled after 2 s of travel. Pose distance has started
 *             moving toward 29 500 Mpc (log-dolly, so even early motion is visible).
 *
 *   T_mid   = 11000 ms — sampled at the halfway mark. Distance should be well
 *             above the early sample, confirming continued movement.
 *
 *   T_end   = 22000 ms — elapsed == 22 s == durationSec. This is the saturation
 *             frame. clipPlayer.tick sets pendingEnd (does NOT dispatch endClip
 *             yet). The driver evaluates to the saturated pose (distance ≈ 29 500).
 *             lastPose is updated to the saturated pose.
 *
 *   T_next  = 23000 ms — the deferred-completion frame. clipPlayer.tick fires
 *             endClip() and the Promise resolver. The driver switches from
 *             clip@95 to resting@0. commit-on-edge (prev='clip',
 *             commitsOnEdge=true) bakes lastPose (saturated, ≈ 29 500) into
 *             camera.base.
 *
 * ### Why one shared clock
 *
 * `clipPlayer.tick` and `runCameraDrivers` MUST receive the same `CameraClock`
 * instance (the one in `cameraRuntime.clock`). `clipElapsed` keys on the
 * `camera.clip` reference identity to detect the start frame and records the
 * wall-clock stamp. Both consumers must call into the SAME bookkeeping bag or
 * the elapsed values diverge between the cue-firer and the driver.
 *
 * ### Why not a stub for clipPlayer / playClip
 *
 * This is an integration test. The whole point is to prove that the REAL
 * pieces close together: real store, real drivers, real clipPlayer, real
 * playClip. A stub would only prove that the stub works.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../src/store/rootReducer';
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import {
  buildCameraDrivers,
  runCameraDrivers,
} from '../../../../src/services/engine/camera/cameraDrivers';
import { activeDriverId } from '../../../../src/services/engine/camera/activeDriverId';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { createClipPlayer } from '../../../../src/services/engine/subsystems/clipPlayer';
import { createPlayClip } from '../../../../src/services/engine/animation/playClip';
import { flyout } from '../../../../src/data/animation/clips/flyout';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';

// ---------------------------------------------------------------------------
// Fixture helpers — mirror the commitOnEdge.test.ts harness shape
// ---------------------------------------------------------------------------

/**
 * Build a minimal EngineState fixture that satisfies `buildCameraDrivers`.
 * Only `cam` and `cameraRuntime` are needed — the driver table reads
 * everything else from the Redux store (`RootState`), not from EngineState.
 */
function makeEngineState(startDistance: number): {
  state: Pick<EngineState, 'cam' | 'cameraRuntime'>;
  cam: OrbitCamera;
} {
  const cam: OrbitCamera = {
    yaw: 0,
    pitch: 0,
    distance: startDistance,
    target: new Float32Array([0, 0, 0]),
    position: new Float32Array([0, 0, 0]),
    fovYRad: 0.8,
    aspect: 1,
    near: 0.01,
    far: 1_000_000,
  } as unknown as OrbitCamera;

  const clock = createCameraClock();

  const state = {
    cam,
    cameraRuntime: {
      clock,
      projection: { fovYRad: 0.8, aspect: 1, near: 0.01, far: 1_000_000 },
      lastPose: {
        current: {
          target: [0, 0, 0] as Vec3,
          yaw: 0,
          pitch: 0,
          distance: startDistance,
        } as CameraPose,
      },
      prevActiveId: { current: 'resting' as string },
      lastRenderedSimDays: { current: 0 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
  };

  return { state, cam };
}

/** Build a real Redux store from the production root reducer. */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/**
 * Simulate one frame of the commit-on-edge loop, with clipPlayer.tick firing
 * FIRST (as it does in the real runFrame) BEFORE the camera produce step.
 *
 * Steps:
 *   1. clipPlayer.tick(nowMs) — fires deferred endClip if pendingEnd, fires
 *      scene cues, advances clipOpacity, records pendingEnd when elapsed ≥ durationSec.
 *   2. Produce pose via runCameraDrivers.
 *   3. Commit-on-edge: if prev driver changed AND the departing driver has
 *      commitsOnEdge, dispatch commitCameraPose(lastPose) and override renderPose.
 *   4. Update bookkeeping: prevActiveId, lastPose.
 *
 * Returns { pose, activeId, committed } for per-frame assertions.
 */
function simulateFrame(
  engineState: ReturnType<typeof makeEngineState>['state'],
  store: ReturnType<typeof makeStore>,
  drivers: ReturnType<typeof buildCameraDrivers>,
  clipPlayer: ReturnType<typeof createClipPlayer>,
  nowMs: number,
): { pose: CameraPose; activeId: string; committed: boolean } {
  const { clock, lastPose, prevActiveId } = engineState.cameraRuntime;

  // Step 1 — clipPlayer fires FIRST, before the produce step.
  clipPlayer.tick(nowMs);

  // Step 2 — produce pose from the driver table (reads fresh store state after tick).
  const freshState = store.getState();
  const pose = runCameraDrivers(drivers, freshState, engineState.cam!, clock, nowMs);
  const currActiveId = activeDriverId(drivers, freshState);

  // Step 3 — commit-on-edge. Mirror the production property-based guard in
  // runFrame.ts: fire commitCameraPose when the prev driver had commitsOnEdge.
  const prev = prevActiveId.current;
  let committed = false;
  let renderPose = pose;
  if (prev !== currActiveId && drivers.find((d) => d.id === prev)?.commitsOnEdge) {
    store.dispatch(commitCameraPose(lastPose.current));
    committed = true;
    renderPose = lastPose.current;
  }

  // Step 4 — update bookkeeping.
  prevActiveId.current = currActiveId;
  lastPose.current = renderPose;

  return { pose: renderPose, activeId: currActiveId, committed };
}

// ---------------------------------------------------------------------------
// Integration test
// ---------------------------------------------------------------------------

describe('playClip — flyout seam', () => {
  it('playClip(flyout) drives the camera and resolves', async () => {
    // The flyout starts from wherever the camera is; seed a concrete starting
    // distance so we have a measurable baseline.
    const LIVE_START_DISTANCE = 100; // Mpc — a typical mid-orbit viewing distance
    const FLYOUT_TARGET = 29_500; // Mpc — the horizon-shell target
    const DURATION_SEC = 22; // seconds — from clips/flyout.ts

    const store = makeStore();
    const { state } = makeEngineState(LIVE_START_DISTANCE);

    // Commit the live pose as the store's `camera.base` so resting produces
    // the correct floor and playClip's 'live' resolution captures the right
    // starting distance.
    store.dispatch(
      commitCameraPose({
        target: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        distance: LIVE_START_DISTANCE,
      }),
    );

    // Seed the cameraRuntime's lastPose to match.
    state.cameraRuntime.lastPose.current = {
      target: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      distance: LIVE_START_DISTANCE,
    };

    // Build the real driver table. `buildCameraDrivers` takes an EngineState
    // but the driver closures only read the Redux RootState at call time —
    // the EngineState parameter is structurally unused (see cameraDrivers.ts).
    const drivers = buildCameraDrivers(state as unknown as EngineState);

    // Build the real clipPlayer with the SAME clock that runCameraDrivers uses.
    // Sharing one CameraClock instance ensures clipElapsed's reference-identity
    // start-stamp is consistent between the cue-firer and the driver.
    const clipPlayer = createClipPlayer({
      store,
      requestRender: () => {},
      clock: state.cameraRuntime.clock,
      // flyout has no scene cues (dollyTo/spin compile to camera base tracks,
      // not show/hide/fade/scene/focus cues), so getEngineState will never be
      // invoked. A minimal stub satisfies the type.
      getEngineState: () => ({}) as EngineState,
    });

    // Build the real playClip. getLivePose reads lastPose.current — the same
    // box cameraRuntime holds, so 'live' resolution captures the live pose at
    // dispatch time.
    const playClip = createPlayClip({
      store,
      clipPlayer,
      getLivePose: () => state.cameraRuntime.lastPose.current,
    });

    // ── Kick off the flyout ──────────────────────────────────────────────────

    // playClip resolves 'live' → { ...flyout.data, start: lastPose.current },
    // registers the end-resolver, attaches the [CANCEL] hook, and dispatches
    // clipStarted. The Promise resolves on the deferred clipEnded frame.
    let settled = false;
    const p = playClip(flyout.data, DEFAULT_ORIENTATION);
    void p.then(() => {
      settled = true;
    });

    // Seed prevActiveId to 'clip' so there is no spurious commit on the
    // arrival frame (same pattern as commitOnEdge.test.ts's clip test).
    state.cameraRuntime.prevActiveId.current = 'clip';

    // ── Drive frames ─────────────────────────────────────────────────────────

    const T0 = 0;
    const STEP_MS = 1_000; // 1-second coarse steps — evaluateClip is pure in t

    // Arrival frame: clip clock is primed; elapsed = 0; pose == start.
    simulateFrame(state, store, drivers, clipPlayer, T0);

    // Early frame (2 s): distance has started moving toward the target.
    simulateFrame(state, store, drivers, clipPlayer, T0 + 2_000);
    const earlyDistance = state.cameraRuntime.lastPose.current.distance;

    // Mid frame (11 s): distance continues to grow (log-dolly is monotonic).
    simulateFrame(state, store, drivers, clipPlayer, T0 + 11_000);
    const midDistance = state.cameraRuntime.lastPose.current.distance;

    // --- ASSERTION 1: camera distance moves toward the target ----------------
    // Early distance must exceed the live start (clip has dolly'd forward).
    expect(earlyDistance).toBeGreaterThan(LIVE_START_DISTANCE);
    // Mid-clip distance must exceed the early distance (dolly is monotonic).
    expect(midDistance).toBeGreaterThan(earlyDistance);

    // Drive from 12 s up through 21 s in coarse steps (no assertions needed
    // here; we just advance the clock so the saturation frame lands correctly).
    for (let t = T0 + 12_000; t < T0 + DURATION_SEC * 1_000; t += STEP_MS) {
      simulateFrame(state, store, drivers, clipPlayer, t);
    }

    // Saturation frame (22 s): elapsed == durationSec. clipPlayer.tick sets
    // pendingEnd but does NOT dispatch endClip. The clip driver evaluates at
    // t=22s → saturated pose (distance ≈ 29 500). lastPose := saturated.
    // NO commit fires this frame (clip is still active).
    const satFrame = simulateFrame(state, store, drivers, clipPlayer, T0 + DURATION_SEC * 1_000);
    expect(satFrame.activeId).toBe('clip'); // still active
    expect(satFrame.committed).toBe(false); // no commit yet
    const saturatedDistance = state.cameraRuntime.lastPose.current.distance;

    // Deferred-completion frame (23 s): clipPlayer.tick fires endClip() and
    // the Promise resolver. The clip driver sees null → resting wins. The
    // commit-on-edge guard (prev='clip', commitsOnEdge=true) bakes lastPose
    // (the saturated pose) into camera.base.
    const endFrame = simulateFrame(
      state,
      store,
      drivers,
      clipPlayer,
      T0 + DURATION_SEC * 1_000 + STEP_MS,
    );
    expect(endFrame.activeId).toBe('resting');
    expect(endFrame.committed).toBe(true);

    // --- ASSERTION 2: Promise resolves after the timeline duration -----------
    // Flush the microtask queue so the .then() handler has a chance to run.
    await Promise.resolve();
    expect(settled).toBe(true);

    // --- ASSERTION 3: camera.base is committed to the saturated final pose ---
    // The commit-on-edge bake must write the saturated distance (≈ 29 500),
    // not a one-frame-stale pre-saturation pose.
    const base = store.getState().camera.base;
    // The log-dolly lands at exactly dollyTo's `to` value at t=durationSec.
    // Use a loose precision (toBeCloseTo with 0 decimal places) — floating-point
    // log-interpolation is very close but not necessarily a round integer.
    expect(base.distance).toBeCloseTo(FLYOUT_TARGET, 0);

    // Confirm lastPose.current (which the commit baked) was the saturated pose,
    // not the initial base distance (regression guard for the two-frame defer).
    expect(saturatedDistance).toBeCloseTo(FLYOUT_TARGET, 0);
  });
});
