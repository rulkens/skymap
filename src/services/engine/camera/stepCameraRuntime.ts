/**
 * stepCameraRuntime — one frame of the camera as a pure step: `prev` in, the
 * next runtime and the actions the frame dispatches out, in the order the store
 * must see them. Stage order is the contract: `replayInput` → `advanceEpochs`
 * (once per frame, at the winner) → arbitrate → `commitOnEdge` →
 * `projectFramePose` (the fold, last). Every stage after the replay reads the
 * EFFECTIVE intent — the snapshot with the replay's actions folded through the
 * camera reducer — never the store, which is written only after `runFrame`
 * installs `next`. Unchanged groups come back by identity.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import type { StepInputs } from '../../../@types/engine/camera/StepInputs';
import type { RootState } from '../../../store/types';

import { replayInput } from './replayInput';
import { pickWinner, elapsedForWinner } from './cameraDrivers';
import { advanceEpochs, elapsedMs } from './cameraEpochs';
import { commitOnEdge } from './commitOnEdge';
import { resolveWorldArm } from './poseFrameConversion';
import { resolveFrameBasis } from './resolveFrameBasis';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from './cameraFraming';
import { projectFramePose } from '../frame/projectFramePose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import cameraReducer, {
  cancelCameraTween,
  clearFrameTween,
} from '../../../state/camera/cameraSlice';

export function stepCameraRuntime(
  prev: CameraRuntime,
  inputs: StepInputs,
): {
  readonly next: CameraRuntime;
  readonly actions: readonly UnknownAction[];
  readonly requestRender: boolean;
  /**
   * The world arm the frame draws — pre-flip on a crossing frame, so the draw
   * and the scale bar see the pose the fold judged.
   */
  readonly world: CameraPose;
  /** The effective snapshot the stages read; the keep-ticking vote must be off the same reading. */
  readonly rootState: RootState;
} {
  const {
    nowMs,
    simDays,
    rootState: stored,
    canvasPx,
    aspect,
    steps,
    bodies,
    clipEpoch,
    drivers,
  } = inputs;
  const focus = stored.selectionRows.focus;
  // Re-derived every frame: the FOV slider can change with no resize event.
  const projection: CameraProjection = {
    fovYRad: stored.settings.camera.fovDeg * (Math.PI / 180),
    aspect,
    near: NEAR_CLIP_MPC,
    far: FAR_CLIP_MPC,
  };
  // `poseBasis` is the COMMITTED frame — the saga writes the destination into
  // `settings.orientation` when a switch starts, so the eye holds still through
  // a roll and only up rotates (`upBasis`, the live B(t)).
  const poseBasis = ORIENTATION_FRAMES[stored.settings.orientation];

  const drained = replayInput(
    { register: prev.register.pose, surface: prev.surface, follow: prev.follow },
    steps,
    {
      rootState: stored,
      nowMs,
      canvasPx,
      projection,
      upBasis: prev.outputs.upBasis,
      poseBasis,
      bodies,
      winnerLastFrame: prev.register.winner,
      autoRotateEpoch: prev.epochs.autoRotate,
    },
  );
  const actions: UnknownAction[] = [...drained.actions];
  // The drivers must see this frame's commits (`endDrag` above all, or
  // `orbitDrag` wins one frame too long). Identity on a steady frame, so a
  // memoised selector keyed on the root object keeps its cache.
  const rootState =
    drained.actions.length === 0
      ? stored
      : { ...stored, camera: drained.actions.reduce(cameraReducer, stored.camera) };

  // The approach hands off on a frame it SATURATED, never on a clock the pick
  // reads independently: a fresh focus row starts a new approach whatever the
  // old memory said, so the two are one fact and cannot disagree on phase.
  const approachDone =
    focus === prev.epochs.follow.ref ? (drained.follow?.saturated ?? false) : false;
  // ONE pick per frame: the epoch advance, the commit gate and the produced pose
  // read the same driver object, so they cannot disagree on who won.
  const winner = pickWinner(drivers, rootState, approachDone);
  const winnerId = winner.id;
  const epochs = advanceEpochs(prev.epochs, {
    intent: rootState.camera,
    focus,
    clip: clipEpoch,
    winnerEpoch: winner.epoch,
    nowMs,
  });
  // The follow memory belongs to one focus row: a fresh row (a same-body
  // re-select included) drops it, and the driver re-captures against the new
  // target on its next produce.
  const followIn = epochs.follow.ref !== prev.epochs.follow.ref ? null : drained.follow;

  const { pose, memory } = winner.pose(
    {
      state: rootState,
      elapsedMs: elapsedForWinner(winner, epochs, nowMs),
      register: drained.register,
      // Against the PREVIOUS frame's up-basis: produce precedes the basis resolve.
      authoredWorld: resolveWorldArm(drained.register, bodies, poseBasis, prev.outputs.upBasis),
      winnerLastFrame: prev.register.winner,
      simDays,
      projection,
      bodies,
      followDistanceTarget: drained.followDistanceTarget,
    },
    followIn,
  );

  // The runtime keeps `upBasis`, NOT `poseBasis`: it seeds the next switch's
  // `fromQuat`, and a re-switch mid-roll must compose from the live pole.
  const rollElapsed = elapsedMs(epochs.frameTween, nowMs);
  const upBasis = resolveFrameBasis(
    rootState.settings.orientation,
    rootState.camera.frameTween,
    rollElapsed,
  );
  // `EASE` clamps, so this frame's basis is already the destination; the clear
  // only affects the next frame's snapshot.
  if (
    rootState.camera.frameTween !== null &&
    rollElapsed >= rootState.camera.frameTween.durationMs
  ) {
    actions.push(clearFrameTween());
  }
  // After produce (the pose is already saturated at `to`) and before
  // commit-on-edge: the cancel lands next frame, when the tween deactivates and
  // the edge commits the register — exactly one commit, exactly at `to`.
  if (
    winnerId === 'tween' &&
    rootState.camera.tween !== null &&
    elapsedMs(epochs.tween, nowMs) >= rootState.camera.tween.durationMs
  ) {
    actions.push(cancelCameraTween());
  }

  const edge = commitOnEdge({
    register: drained.register,
    displayed: prev.outputs.displayed,
    produced: pose,
    prevWinner: prev.register.winner,
    winner,
    drivers,
  });
  actions.push(...edge.actions);
  // The fold reads the SAME intent the drivers resolved against: the edge
  // commit above is not visible to this frame's regime read.
  const projected = projectFramePose({
    render: edge.render,
    authoredOverride: edge.authoredOverride,
    pivotsOnFocusedBody: winner.pivotsOnFocusedBody ?? false,
    focus,
    simDays,
    follow: memory,
    surface: drained.surface,
    intent: rootState.camera,
    bodies,
    poseBasis,
    upBasis,
  });
  actions.push(...projected.actions);

  return {
    next: {
      register: { pose: projected.register, winner: winnerId },
      epochs,
      follow: memory,
      surface: projected.surface,
      outputs: {
        displayed: projected.displayed,
        simDays,
        upBasis,
        projection,
        lastZoomFactor: drained.lastZoomFactor ?? prev.outputs.lastZoomFactor,
      },
    },
    actions,
    requestRender: projected.requestRender,
    world: projected.world,
    rootState,
  };
}
