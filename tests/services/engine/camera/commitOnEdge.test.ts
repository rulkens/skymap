/**
 * commitOnEdge — the per-frame commit-on-edge contract: on the frame the
 * active driver changes, if the departing driver declared `commitsOnEdge`
 * (tween, autoRotate, clip — not orbitDrag/resting), `commitCameraPose` of the
 * register fires exactly once. The real stage, driven against the driver table
 * + Redux store in `stepCameraRuntime`'s produce → tween-completion →
 * commit-on-edge → register-update order; no GPU, no `runFrame` body.
 */

import { describe, it, expect, vi } from 'vitest';

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
import { elapsedForWinner, pickWinner } from '../../../../src/services/engine/camera/cameraDrivers';
import { makeDriverCtx } from '../../../helpers/camera/makeDriverCtx';
import { commitOnEdge } from '../../../../src/services/engine/camera/commitOnEdge';
import {
  advanceEpoch,
  advanceEpochs,
  elapsedMs,
} from '../../../../src/services/engine/camera/cameraEpochs';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { deriveSimDays } from '../../../../src/utils/time/deriveSimDays';
import { selectTimeState } from '../../../../src/state/time/selectors';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';

/**
 * The commit-on-edge contract drives the driver table + Redux store directly
 * (no GPU, no `runFrame` body), so the shared sim harness's boot focus/pose
 * are noise — every test seeds exactly the state it needs.
 */
function makeHarness() {
  return makeCameraSimHarness({ focusBody: null, bootHR: null });
}

/**
 * Simulate one frame of the commit-on-edge logic, mirroring runFrame's guard.
 * Returns { pose, activeId, committed } so tests can inspect per-frame output.
 */
function simulateFrame(
  engineState: ReturnType<typeof makeHarness>['state'],
  store: ReturnType<typeof makeHarness>['store'],
  drivers: ReturnType<typeof makeHarness>['deps']['drivers'],
  nowMs: number,
): { pose: FramedCameraPose; activeId: string; committed: boolean } {
  const rootState = store.getState();
  const { register } = engineState.cameraRuntime;

  // Step 1: the epoch advance at the winner (the clip row as the player would
  // hand it over), then produce off the advanced rows.
  const currWinner = pickWinner(drivers, rootState);
  const currActiveId = currWinner.id;
  const prevEpochs = engineState.cameraRuntime.epochs;
  const epochs = advanceEpochs(prevEpochs, {
    intent: rootState.camera,
    focus: rootState.selectionRows.focus,
    clip: advanceEpoch(prevEpochs.clip, rootState.camera.clip, nowMs),
    winnerId: currActiveId,
    nowMs,
  });
  engineState.cameraRuntime = { ...engineState.cameraRuntime, epochs };
  const { pose } = currWinner.pose(
    makeDriverCtx({
      state: rootState,
      elapsedMs: elapsedForWinner(currActiveId, epochs, nowMs),
      register: register.pose,
      winnerLastFrame: register.winner,
      simDays: deriveSimDays(selectTimeState(rootState), nowMs),
      projection: engineState.cameraRuntime.outputs.projection,
    }),
    engineState.cameraRuntime.follow,
  );

  // Step 2: Tween completion.
  let committed = false;
  if (
    currActiveId === 'tween' &&
    rootState.camera.tween !== null &&
    elapsedMs(epochs.tween, nowMs) >= rootState.camera.tween.durationMs
  ) {
    store.dispatch(cancelCameraTween());
  }

  // Step 3: the real stage; every incoming driver here pivots, so the edge
  // frame renders the just-committed register, not the stale-base produce.
  const edge = commitOnEdge({
    register: register.pose,
    displayed: engineState.cameraRuntime.outputs.displayed,
    produced: pose,
    prevWinner: register.winner,
    winner: currWinner,
    drivers,
  });
  for (const action of edge.actions) store.dispatch(action);
  committed = edge.actions.length > 0;

  // Step 4: Update Resources.
  engineState.cameraRuntime = {
    ...engineState.cameraRuntime,
    register: { pose: edge.render, winner: currActiveId },
  };

  return { pose: edge.render, activeId: currActiveId, committed };
}

describe('commitOnEdge — tween settles', () => {
  it('tween active: no commit fires while the tween is still the winner', () => {
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

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
    // Seed register.winner to 'tween' so the tween is treated as already active
    // from frame 0 (no edge on the first frame of a tween).
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    // Run several frames in the middle of the tween.
    let anyCommit = false;
    for (let t = 100; t < 900; t += 100) {
      const { committed } = simulateFrame(state, store, drivers, t);
      if (committed) anyCommit = true;
    }

    expect(anyCommit).toBe(false);
  });

  it('cancelCameraTween is dispatched exactly once when elapsed >= durationMs', () => {
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;
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
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    // Arrival frame starts the epoch (elapsed 0); subsequent frames read off it.
    simulateFrame(state, store, drivers, 0); // arrival: starts the epoch
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
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: { target: [0, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 200,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    simulateFrame(state, store, drivers, 0); // arrival: starts the epoch
    // Cancel frame: elapsed 200 >= durationMs, cancelCameraTween dispatched,
    // driver STILL shows as 'tween' this frame (cancel takes effect next frame).
    const frame1 = simulateFrame(state, store, drivers, 200); // cancel frame
    expect(frame1.committed).toBe(false); // no commit on the cancel frame

    // Frame after cancel: tween is null → driver changes from 'tween' to 'resting'
    // → commit-on-edge fires.
    const frame2 = simulateFrame(state, store, drivers, 220); // deactivation edge
    expect(frame2.committed).toBe(true);
  });

  it('commit bakes the saturated `to` pose into base (register.pose on the cancel frame == to)', () => {
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;
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
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    simulateFrame(state, store, drivers, 0); // arrival: starts the epoch
    simulateFrame(state, store, drivers, 200); // cancel frame: elapsed 200 >= durationMs, register.pose := saturated TO
    simulateFrame(state, store, drivers, 220); // commit frame: base := register.pose == TO

    const base = worldArmOf(store.getState().camera.base);
    expect(base.yaw).toBeCloseTo(TO.yaw, 6);
    expect(base.pitch).toBeCloseTo(TO.pitch, 6);
    expect(base.distance).toBeCloseTo(TO.distance, 6);
    expect(Array.from(base.target as number[])).toEqual([5, 10, 15]);
  });

  it('the deactivation frame RENDERS the committed pose, not the stale base (no edge flicker)', () => {
    // Commit-on-edge fires AFTER produce, so on the deactivation frame the
    // resting driver reads the pre-commit base. Without the renderPose
    // override the frame would flash the pre-tween pose (PRE) for one frame
    // before the next frame snaps to the target.
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;
    const PRE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
    const TO: CameraPose = { target: [5, 10, 15], yaw: 2.5, pitch: -0.3, distance: 40 };

    store.dispatch(commitCameraPose(absoluteArm(PRE)));
    store.dispatch(
      startCameraTween({
        from: PRE,
        to: TO,
        durationMs: 200,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    simulateFrame(state, store, drivers, 0); // arrival: starts the epoch
    simulateFrame(state, store, drivers, 200); // cancel frame: register.pose := saturated TO
    const edge = simulateFrame(state, store, drivers, 220); // deactivation edge

    expect(edge.activeId).toBe('resting');
    expect(edge.committed).toBe(true);
    // The rendered pose is the committed target, NOT the stale pre-tween base.
    expect(worldArmOf(edge.pose).yaw).toBeCloseTo(TO.yaw, 6);
    expect(worldArmOf(edge.pose).distance).toBeCloseTo(TO.distance, 6);
  });
});

describe('commitOnEdge — auto-rotate deactivation', () => {
  it('commitCameraPose fires exactly once when auto-rotate turns off', () => {
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    // Activate auto-rotate.
    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'autoRotate' },
    };

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
  it('register.pose during a tween reflects the visible pose, not base', () => {
    // If drag seeding reads `register.pose` (as it should), grabbing during
    // a tween never snaps to the stale `base`. This test verifies that after a
    // tween runs for a few frames, `register.pose` differs from `base`.
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    const BASE_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
    store.dispatch(commitCameraPose(absoluteArm(BASE_POSE)));
    store.dispatch(
      startCameraTween({
        from: BASE_POSE,
        to: { target: [10, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    simulateFrame(state, store, drivers, 0); // arrival: starts the epoch, elapsed 0, register.pose == from == base
    simulateFrame(state, store, drivers, 500); // elapsed 500/1000 → yaw interpolated between 0 and 1

    // `register.pose` must NOT equal the stale `base` (which is still
    // the pre-tween committed pose).
    const lastPose = worldArmOf(state.cameraRuntime.register.pose);
    const base = worldArmOf(store.getState().camera.base);
    // After 500ms of a 1000ms tween the yaw is somewhere between 0 and 1.
    expect(lastPose.yaw).not.toBe(base.yaw);
  });

  it('grab mid-tween commits the displaced tween pose into base (tween→orbitDrag edge)', () => {
    // When the user grabs during a tween, the commit-on-edge guard fires because
    // the prev driver was 'tween'. This bakes the displaced tween's last pose into
    // `base` so the drag seeds from `register.pose` and the final pose is jump-free.
    // orbitDrag is excluded from triggering a commit only as the PREV driver, not
    // as the incoming one — design §6 no-jump guarantee.
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    store.dispatch(
      startCameraTween({
        from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
        to: { target: [10, 0, 0], yaw: 1, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'tween' },
    };

    simulateFrame(state, store, drivers, 0); // arrival: starts the epoch
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
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    const START_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 80 };
    const clip: ClipData = { start: START_POSE, timeline: [] };

    // Activate the clip driver. `frame` matches the store's default orientation
    // so the driver's re-encode is a no-op — this test only cares about the
    // commit-on-edge boolean, not the pose value.
    store.dispatch(clipStarted({ data: clip, frame: DEFAULT_ORIENTATION }));
    // Seed register.winner so there's no spurious commit on the first frame.
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'clip' },
    };

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
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    store.dispatch(beginDrag());
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, winner: 'orbitDrag' },
    };

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

  it('a playing clip keeps the camera against a body-arm gesture', () => {
    // Taking the camera for a held gesture and handing it back to a clip whose
    // commit-on-edge bakes its OWN final pose would discard the gesture whole
    // at pointerup. The gesture row serves both arms at 80; the clip's 95
    // outranks it either way: a clip is not drag-interruptible.
    const { store, state, deps } = makeHarness();
    const drivers = deps.drivers;

    // The rows read `base.frame` only, so the pose value is irrelevant here.
    store.dispatch(
      commitCameraPose({
        frame: { body: 'earth' },
        pose: {
          bodyId: 'earth',
          anchorLocalM: [0, 0, 0],
          eyeRelAnchorM: [0, 0, 1e7],
          basisLocal: [1, 0, 0, 0, 1, 0, 0, 0, -1],
        },
      }),
    );
    store.dispatch(beginDrag());
    expect(pickWinner(drivers, store.getState()).id).toBe('orbitDrag');

    store.dispatch(
      clipStarted({
        data: { start: { target: [1, 2, 3], yaw: 0, pitch: 0, distance: 80 }, timeline: [] },
        frame: DEFAULT_ORIENTATION,
      }),
    );
    expect(pickWinner(drivers, store.getState()).id).toBe('clip');
  });
});
