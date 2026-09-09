/**
 * playClipFlyout — integration test for the full playClip→clipPlayer→clip@95
 * driver→commit-on-edge seam, driven by the `flyout` ClipData. Validates the
 * handshake (dispatch, frames, the two-frame deferred endClip → bake →
 * Promise resolve) with REAL store/drivers/clipPlayer/playClip, not stubs —
 * `evaluateClip.test.ts` owns the evaluator math itself.
 */

import { describe, it, expect } from 'vitest';

import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { runCameraDrivers } from '../../../../src/services/engine/camera/cameraDrivers';
import { activeDriverId } from '../../../../src/services/engine/camera/activeDriverId';
import { advanceEpochs } from '../../../../src/services/engine/camera/cameraEpochs';
import { createClipPlayer } from '../../../../src/services/engine/subsystems/clipPlayer';
import { createPlayClip } from '../../../../src/services/engine/animation/playClip';
import { flyout } from '../../../../src/data/animation/clips/flyout';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';

// Fixture helpers mirror the commitOnEdge.test.ts harness shape.

/**
 * The playClip↔clipPlayer↔driver seam is driven directly (no GPU, no
 * `runFrame` body), so the shared sim harness's boot focus/pose are noise —
 * this test seeds exactly the live pose it needs at `startDistance`.
 */
function makeHarness(startDistance: number) {
  return makeCameraSimHarness({ focusBody: null, bootHR: null, neutralDistance: startDistance });
}

/**
 * Simulate one frame of the commit-on-edge loop, with clipPlayer.tick firing
 * FIRST (as it does in the real runFrame) BEFORE the camera produce step.
 * Returns { pose, activeId, committed } for per-frame assertions.
 */
function simulateFrame(
  engineState: ReturnType<typeof makeHarness>['state'],
  store: ReturnType<typeof makeHarness>['store'],
  drivers: ReturnType<typeof makeHarness>['deps']['drivers'],
  clipPlayer: ReturnType<typeof createClipPlayer>,
  nowMs: number,
): { pose: FramedCameraPose; activeId: string; committed: boolean } {
  const { lastPose, prevActiveId } = engineState.cameraRuntime;

  // Step 1 — clipPlayer fires FIRST, before the produce step; the clip epoch it
  // hands back feeds this frame's advance.
  const { clipEpoch } = clipPlayer.tick(engineState.cameraRuntime.epochs.clip, nowMs);

  // Step 2 — advance at the winner, then produce off the advanced rows (reads
  // fresh store state after tick).
  const freshState = store.getState();
  const currActiveId = activeDriverId(drivers, freshState);
  const epochs = advanceEpochs(engineState.cameraRuntime.epochs, {
    intent: freshState.camera,
    focus: freshState.selectionRows.focus,
    clip: clipEpoch,
    winnerId: currActiveId,
    nowMs,
  });
  engineState.cameraRuntime.epochs = epochs;
  const pose = runCameraDrivers(drivers, freshState, epochs, nowMs);

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

describe('playClip — flyout seam', () => {
  it('playClip(flyout) drives the camera and resolves', async () => {
    // The flyout starts from wherever the camera is; seed a concrete starting
    // distance so we have a measurable baseline.
    const LIVE_START_DISTANCE = 100; // Mpc — a typical mid-orbit viewing distance
    const FLYOUT_TARGET = 29_500; // Mpc — the horizon-shell target
    const DURATION_SEC = 22; // seconds — from clips/flyout.ts

    const { store, state, deps } = makeHarness(LIVE_START_DISTANCE);

    // Commit the live pose as the store's `camera.base` so resting produces
    // the correct floor and playClip's 'live' resolution captures the right
    // starting distance.
    store.dispatch(
      commitCameraPose(
        absoluteArm({
          target: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          distance: LIVE_START_DISTANCE,
        }),
      ),
    );

    // Seed the cameraRuntime's lastPose to match.
    state.cameraRuntime.lastPose.current = absoluteArm({
      target: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      distance: LIVE_START_DISTANCE,
    });

    // The real driver table, built by the harness. `buildCameraDrivers` takes
    // an EngineState but the driver closures only read the Redux RootState at
    // call time — the EngineState parameter is structurally unused (see
    // cameraDrivers.ts).
    const drivers = deps.drivers;

    // The real clipPlayer; `simulateFrame` threads the clip epoch it returns
    // into the frame's advance, as `runFrame` does.
    const clipPlayer = createClipPlayer({
      store,
      requestRender: () => {},
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
      getLivePose: () => worldArmOf(state.cameraRuntime.lastPose.current),
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

    // Arrival frame: the clip epoch starts; elapsed = 0; pose == start.
    simulateFrame(state, store, drivers, clipPlayer, T0);

    // Early frame (2 s): distance has started moving toward the target.
    simulateFrame(state, store, drivers, clipPlayer, T0 + 2_000);
    const earlyDistance = worldArmOf(state.cameraRuntime.lastPose.current).distance;

    // Mid frame (11 s): distance continues to grow (log-dolly is monotonic).
    simulateFrame(state, store, drivers, clipPlayer, T0 + 11_000);
    const midDistance = worldArmOf(state.cameraRuntime.lastPose.current).distance;

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
    const saturatedDistance = worldArmOf(state.cameraRuntime.lastPose.current).distance;

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
    const base = worldArmOf(store.getState().camera.base);
    // The log-dolly lands at exactly dollyTo's `to` value at t=durationSec.
    // Use a loose precision (toBeCloseTo with 0 decimal places) — floating-point
    // log-interpolation is very close but not necessarily a round integer.
    expect(base.distance).toBeCloseTo(FLYOUT_TARGET, 0);

    // Confirm lastPose.current (which the commit baked) was the saturated pose,
    // not the initial base distance (regression guard for the two-frame defer).
    expect(saturatedDistance).toBeCloseTo(FLYOUT_TARGET, 0);
  });
});
