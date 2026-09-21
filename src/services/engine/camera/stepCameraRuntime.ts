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

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import type { DriverId } from '../../../@types/engine/camera/DriverId';
import type { RungCtx } from '../../../@types/camera/RungCtx';
import type { StepInputs } from '../../../@types/engine/camera/StepInputs';
import type { RootState } from '../../../store/types';

import { replayInput } from './replayInput';
import { pickWinner, elapsedForWinner, settledMemory } from './cameraDrivers';
import { advanceEpochs, elapsedMs } from './cameraEpochs';
import { commitOnEdge } from './commitOnEdge';
import { pivotFraming } from './pivotRadiusMpc';
import { releasedWorldArm } from './releasedWorldArm';
import { frameKey } from './rungs/frameKey';
import { rowFor } from './rungs/rowFor';
import { isWorldArm } from './rungs/isWorldArm';
import { resolveFrameBasis } from './resolveFrameBasis';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from './cameraFraming';
import { projectFramePose } from '../frame/projectFramePose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { reencodePose } from '../../../utils/camera/reencodePose';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import cameraReducer, {
  cancelCameraTween,
  clearFrameTween,
  commitCameraPose,
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
    rootState: rawStored,
    canvasPx,
    aspect,
    steps,
    bodies,
    terrainHeightAt,
    clipEpoch,
    drivers,
  } = inputs;
  // A `base` the loop did not write is a commit from outside: `resting`
  // authored it verbatim, so last frame's author reads as `resting` — the
  // departing row bakes nothing over it and the follow rows adopt it. Read off
  // the RAW snapshot: our own re-encode below is about to change `base`'s
  // identity too, and that must never itself read as an outside commit.
  const external = rawStored.camera.base !== prev.base;
  const winnerLastFrame: DriverId = external ? 'resting' : prev.register.winner;

  // The loop, not the orientation saga, re-encodes: the outgoing basis is what
  // `base`'s angles are valid in, never a mid-slerp one. Folded in BEFORE the
  // replay so every stage below reads a `base` already valid in the frame
  // `settings.orientation` names, and pushed first into `actions` so it lands
  // as this frame's own commit (never as an outside one — see `external` above).
  const orientationActions: UnknownAction[] = [];
  let stored = rawStored;
  if (rawStored.settings.orientation !== prev.orientation && isWorldArm(rawStored.camera.base)) {
    const reencodeAction = commitCameraPose(
      absoluteArm(
        reencodePose(
          rawStored.camera.base.pose,
          ORIENTATION_FRAMES[prev.orientation],
          ORIENTATION_FRAMES[rawStored.settings.orientation],
        ),
      ),
    );
    orientationActions.push(reencodeAction);
    stored = { ...rawStored, camera: cameraReducer(rawStored.camera, reencodeAction) };
  }
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
  // `stored`, not the post-replay snapshot: the replay runs before that exists,
  // and no action it emits writes `tuning`, so the two readings are identical.
  const tuning = stored.camera.tuning;
  // Every rung field but the up-basis. The replay and the produce run BEFORE
  // this frame's basis resolves, so they read the previous frame's; the fold
  // reads this frame's. One shared value would move the settle trace.
  const rungFields = {
    bodies,
    poseBasis,
    focusBodyId: focus?.type === 'body' ? (focus.id as BodyId) : null,
    pivot: pivotFraming(focus),
    viewportPx: canvasPx,
    fovYRad: projection.fovYRad,
    tuning,
    terrainHeightAt,
  };
  const replayCtx: RungCtx = { ...rungFields, upBasis: prev.outputs.upBasis };

  const drained = replayInput(
    {
      register: prev.register.pose,
      gesture: prev.gesture.value,
      tilt: prev.tilt,
      follow: prev.follow,
    },
    steps,
    {
      ctx: replayCtx,
      rootState: stored,
      nowMs,
      winnerLastFrame,
      autoRotateEpoch: prev.epochs.autoRotate,
    },
  );
  const actions: UnknownAction[] = [...orientationActions, ...drained.actions];
  // The drivers must see this frame's commits (`endDrag` above all, or
  // `orbitDrag` wins one frame too long). Identity on a steady frame, so a
  // memoised selector keyed on the root object keeps its cache.
  const rootState =
    drained.actions.length === 0
      ? stored
      : { ...stored, camera: drained.actions.reduce(cameraReducer, stored.camera) };

  // The approach hands off on a frame it SATURATED, never on a clock the pick
  // reads independently: a fresh focus row starts a new approach whatever the
  // old memory said, so the two are one fact and cannot disagree on phase. An
  // outside commit hands off too: the commit IS the framing, so no approach
  // is owed, whatever the epoch reads.
  const approachDone =
    external || (focus === prev.epochs.follow.ref ? (drained.follow?.saturated ?? false) : false);
  // ONE pick per frame: the epoch advance, the commit gate and the produced pose
  // read the same driver object, so they cannot disagree on who won.
  const winner = pickWinner(drivers, rootState, approachDone);
  const winnerId = winner.id;
  const epochs = advanceEpochs(prev.epochs, {
    intent: rootState.camera,
    focus,
    clip: clipEpoch,
    winnerEpoch: winner.epoch,
    winnerDelivers: winner.deliversFraming ?? false,
    nowMs,
  });
  // The follow memory belongs to one focus row: a fresh row (a same-body
  // re-select included) drops it, and the driver re-captures against the new
  // target on its next produce.
  const followIn = epochs.follow.ref !== prev.epochs.follow.ref ? null : drained.follow;
  const edge = commitOnEdge({
    register: drained.register,
    displayed: prev.outputs.displayed,
    prevWinner: winnerLastFrame,
    winner,
    drivers,
  });

  const { pose, memory } = winner.pose(
    {
      state: rootState,
      elapsedMs: elapsedForWinner(winner, epochs, nowMs),
      register: drained.register,
      // Both by reference in the world arm, so the follow rows' world numbers
      // — and the goldens — are untouched. Below it they are the world arm a
      // hand-back would land on: an arm's roll is its local horizon, and an
      // approach that carried it out would leave the image tilted for good
      // (the band test `releasedWorldRoll` makes is the same one).
      authoredWorld: releasedWorldArm(drained.register, replayCtx, tuning),
      // Post-edge: a follow row taking over from a tween adopts where the tween
      // LANDED, not the pose the tween departed from (still `base` this frame).
      committedWorld: releasedWorldArm(edge.committed ?? rootState.camera.base, replayCtx, tuning),
      winnerLastFrame,
      poseBasis,
      simDays,
      projection,
      bodies,
      followDistanceTarget: drained.followDistanceTarget,
    },
    // Same status a tween or clip has: an outside commit delivers the framing
    // itself, so the follow row that resumes owes it no approach.
    external ? settledMemory(followIn) : followIn,
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

  actions.push(...edge.actions);
  const foldCtx: RungCtx = { ...rungFields, upBasis };
  // The fold reads the SAME intent the drivers resolved against: the edge
  // commit above is not visible to this frame's regime read.
  const projected = projectFramePose({
    render: edge.render ?? pose,
    authoredOverride: edge.authoredOverride,
    pivotsOnFocusedBody: winner.pivotsOnFocusedBody ?? false,
    focus,
    follow: memory,
    tilt: drained.tilt,
    intent: rootState.camera,
    ctx: foldCtx,
  });
  actions.push(...projected.actions);

  // The gesture memory belongs to the arm it was taken on, so a crossing voids
  // it — inert today, because only the fold re-keys the register and it is
  // skipped whole while `intent.dragging`, never between a latch and its
  // release. The identity keep needs BOTH halves: an already-empty value under
  // a changed key must still re-key, or the wipe re-fires every frame.
  const gestureKey = frameKey(projected.register.frame);
  const gestureValue =
    gestureKey === prev.gesture.key
      ? drained.gesture
      : rowFor(projected.register.frame).emptyMemory;
  const gesture =
    gestureKey === prev.gesture.key && gestureValue === prev.gesture.value
      ? prev.gesture
      : { key: gestureKey, value: gestureValue };

  return {
    next: {
      register: { pose: projected.register, winner: winnerId },
      // The camera the store will hold once `runFrame` dispatches `actions`;
      // reduce only the TAIL after `orientationActions`+`drained.actions` —
      // both are already folded into `rootState.camera`, so re-reducing them
      // would apply them twice. By identity on an idle frame (empty tail,
      // `rootState.camera` is `stored.camera` is `rawStored.camera`), which
      // is what `winnerLastFrame` above compares against next frame.
      base: actions
        .slice(orientationActions.length + drained.actions.length)
        .reduce(cameraReducer, rootState.camera).base,
      // Tracks the frame `base` is now valid in, whatever this frame did with
      // it — a body arm sees no re-encode above but the switch still lands.
      orientation: stored.settings.orientation,
      epochs,
      follow: memory,
      gesture,
      tilt: projected.tilt,
      outputs: {
        displayed: projected.displayed,
        simDays,
        upBasis,
        projection,
      },
    },
    actions,
    requestRender: projected.requestRender,
    world: projected.world,
    rootState,
  };
}
