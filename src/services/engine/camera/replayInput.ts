/**
 * replayInput — one frame's input steps folded over the camera runtime, pure:
 * the new register/gesture/tilt/follow memories plus the actions the drain would
 * have dispatched, in order. Each step reads the EFFECTIVE intent — the frame's
 * store snapshot with the actions emitted so far folded through the real camera
 * reducer — so a step sees the commit the step before it made, exactly as the
 * incumbent's fresh `getState()` per step did. The store commits only at
 * gesture end and per at-rest notch; a following camera's notch rides the
 * return as `followDistanceTarget` instead.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

import { applyInputToCamera } from '../../camera/applyInputToCamera';
import { applyWheelZoom } from './applyWheelZoom';
import { advanceEpoch, elapsedMs } from './cameraEpochs';
import { frameAlignedRoll } from './frameAlignedRoll';
import { bodyRung } from './rungs/bodyRung';
import { foldToWorld } from './rungs/foldToWorld';
import { hostOf } from './rungs/hostOf';
import { isWorldArm } from './rungs/isWorldArm';
import { sameFrame } from './rungs/sameFrame';
import { zoomedDistance } from '../../../utils/camera/zoomedDistance';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { isFollowDriverId } from '../../../utils/camera/isFollowDriverId';
import { selectFocusRow } from '../../../state/selection/selectors';
import cameraReducer, { endDrag, commitCameraPose } from '../../../state/camera/cameraSlice';

import type { DriverId } from '../../../@types/engine/camera/DriverId';
import type { Epoch } from '../../../@types/engine/camera/Epoch';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { InputStep } from '../../../@types/camera/InputStep';
import type { RungCtx } from '../../../@types/camera/RungCtx';
import type { SurfaceGestureMemory } from '../../../@types/camera/SurfaceGestureMemory';
import type { TiltMemory } from '../../../@types/camera/TiltMemory';
import type { RootState } from '../../../store/types';

export function replayInput(
  prev: {
    readonly register: FramedCameraPose;
    readonly gesture: SurfaceGestureMemory;
    readonly tilt: TiltMemory;
    readonly follow: FollowMemory | null;
  },
  steps: readonly InputStep[],
  args: {
    readonly ctx: RungCtx;
    readonly rootState: RootState;
    readonly nowMs: number;
    readonly winnerLastFrame: DriverId;
    readonly autoRotateEpoch: Epoch<FramedCameraPose>;
  },
): {
  readonly register: FramedCameraPose;
  readonly gesture: SurfaceGestureMemory;
  readonly tilt: TiltMemory;
  readonly follow: FollowMemory | null;
  readonly followDistanceTarget: number | null;
  readonly actions: readonly UnknownAction[];
} {
  const { ctx, rootState, nowMs, winnerLastFrame } = args;
  const { bodies, poseBasis, upBasis, pivot, tuning } = ctx;
  const cssHeight = ctx.viewportPx[1];
  // Only camera actions are emitted mid-drain, so every other slice is the
  // snapshot's; the focus row is read once.
  const focus = selectFocusRow(rootState);

  // The accumulator. EVERY step writes the register so a later step in the same
  // drain chains from it — an at-rest notch left out of it would be folded over
  // and silently discarded by a drag arriving in the same frame window.
  let register = prev.register;
  let gestureMemory = prev.gesture;
  let tilt = prev.tilt;
  let follow = prev.follow;
  let followDistanceTarget: number | null = null;
  // Advanced locally for this frame's elapsed read and DISCARDED: handing it to
  // `advanceEpochs` would keep a fold-time reset when another driver wins.
  let autoRotateEpoch = args.autoRotateEpoch;
  let camera = rootState.camera;
  const actions: UnknownAction[] = [];
  const emit = (action: UnknownAction): void => {
    actions.push(action);
    camera = cameraReducer(camera, action);
  };

  /**
   * Which rung owns this step, and the arbitration around it. The GATE is the
   * stored regime (`base.frame`); the POSE is the live register, because the
   * fold commits on a regime EDGE only — mid-tween `base` holds the last
   * crossing pose while the register tracks the animation (FW-G).
   */
  const stepBodyRung = (step: InputStep): boolean => {
    const base = camera.base;
    if (isWorldArm(base)) return false;
    // A pose-moving step is swallowed while a clip owns the camera (the driver
    // table's rule, both arms) or while the host is unresolved — the cell's
    // `hostOrThrow` would throw. The pointer edges still reach the rung: the
    // latch tracks the POINTER, and they re-tag nothing.
    const moves = step.kind === 'drag' || step.kind === 'zoom';
    if (moves && (camera.clip !== null || hostOf(base.frame, ctx) === null)) return true;
    const from =
      register.frame !== 'absolute' && register.frame.body === base.frame.body
        ? register.pose
        : base.pose;
    const stepped = bodyRung.step(
      gestureMemory,
      tilt,
      { frame: base.frame, pose: from },
      step,
      ctx,
    );
    gestureMemory = stepped.memory;
    tilt = stepped.tilt;
    if (!moves) return true;
    register = { frame: base.frame, pose: stepped.pose };
    // An at-rest notch is its own atomic gesture, so its commit is its gesture
    // end (the resting driver renders `base`, not the register). Identity, not
    // equality: a declined step returns its input by reference.
    if (step.kind === 'zoom' && !step.duringGesture && stepped.pose !== from) {
      emit(commitCameraPose(register));
    }
    return true;
  };

  const applyWorldStep = (step: Extract<InputStep, { kind: 'drag' } | { kind: 'zoom' }>): void => {
    // A playing clip is not gesture-interruptible: swallowed, not folded under it.
    if (camera.clip !== null) return;
    // AUTHORED, not displayed (R12b-1): the drag composes below the tilt.
    const world = foldToWorld(register, ctx);
    let next = applyInputToCamera(world, step, cssHeight, pivot, ctx.fovYRad, poseBasis, upBasis);
    if (step.kind === 'zoom') {
      // The roll ride runs on every driven zoom path, gesture-held included.
      const roll = frameAlignedRoll(
        world,
        next,
        bodies,
        poseBasis,
        upBasis,
        Math.abs(Math.log(step.factor)),
        tuning,
      );
      next = { ...next, roll };
    }
    if (step.kind === 'drag' && step.mode === 'pan' && bodyMovesThisFrame(focus)) {
      // Followed-body strafe: the pivot-pin owns the target (`bodyPosition +
      // panOffset`), so the pan's own delta goes to the offset the pin reads.
      const off = follow?.panOffset ?? [0, 0, 0];
      follow = {
        from: follow?.from ?? null,
        distanceTarget: follow?.distanceTarget ?? null,
        panOffset: [
          off[0] + next.target[0] - world.target[0],
          off[1] + next.target[1] - world.target[1],
          off[2] + next.target[2] - world.target[2],
        ],
        saturated: follow?.saturated ?? false,
      };
    }
    register = absoluteArm(next);
  };

  for (const step of steps) {
    switch (step.kind) {
      case 'gestureStart':
        // The latch itself is the rung's; the first drag step takes it, carrying
        // the press pixel. The world arm keeps no gesture register at all.
        stepBodyRung(step);
        break;

      case 'gestureEnd': {
        // ONE commit site for both arms: bake the register into `base` before
        // `endDrag`. Skipped while a clip owns the camera and across an arm
        // mismatch — the fold owns regime edges; a commit here must never flip one.
        if (camera.clip === null && sameFrame(register.frame, camera.base.frame)) {
          emit(commitCameraPose(register));
        }
        stepBodyRung(step);
        emit(endDrag());
        break;
      }

      case 'drag':
        if (!stepBodyRung(step)) applyWorldStep(step);
        break;

      case 'zoom': {
        // The settles are priced per unit of zoom, not per step (user ruling
        // 2026-09-10): a trackpad twitch must not spend a mouse notch's decay.
        const logZoom = Math.abs(Math.log(step.factor));
        // In a body arm both zoom owners route to the anchored step (§7).
        if (stepBodyRung(step)) break;
        if (step.duringGesture) {
          applyWorldStep(step);
          break;
        }
        // A follow row re-asserts its own target every frame and would swallow
        // a committed base, so its notch is resolved to a distance the driver
        // adopts; a second notch in the same drain resolves off the first.
        const followTargetBefore = followDistanceTarget ?? follow?.distanceTarget ?? null;
        if (
          isWorldArm(camera.base) &&
          isFollowDriverId(winnerLastFrame) &&
          followTargetBefore !== null
        ) {
          followDistanceTarget = zoomedDistance(followTargetBefore, step.factor, pivot);
          // Ruling 8: the ride's authored altitude move IS that target change —
          // the live pose twice gave a zero delta and froze the band roll. It
          // lands on `base.roll`, the term the follow pose lerps toward.
          const basePose = camera.base.pose;
          const live = foldToWorld(register, ctx);
          const roll = frameAlignedRoll(
            { ...live, distance: followTargetBefore },
            { ...live, distance: followDistanceTarget },
            bodies,
            poseBasis,
            upBasis,
            logZoom,
            tuning,
          );
          if (roll !== (basePose.roll ?? 0))
            emit(commitCameraPose(absoluteArm({ ...basePose, roll })));
          break;
        }
        // The spin epoch as THIS frame's advance will see it (idempotent on an
        // unchanged ref), not the stale row a switch-off between frames left.
        const { active, rate } = camera.autoRotate;
        autoRotateEpoch = advanceEpoch(autoRotateEpoch, active ? camera.base : null, nowMs);
        const zoomed = applyWheelZoom({
          base: camera.base,
          factor: step.factor,
          spin: { owns: winnerLastFrame === 'autoRotate', rate },
          spinElapsedMs: elapsedMs(autoRotateEpoch, nowMs),
          pivot,
        });
        if (zoomed !== null && isWorldArm(camera.base)) {
          // `base` is centre-looking by wiring (R12-1), so the pre/post pair is
          // self-consistent under an autoRotate-owned notch too.
          const roll = frameAlignedRoll(
            camera.base.pose,
            zoomed,
            bodies,
            poseBasis,
            upBasis,
            logZoom,
            tuning,
          );
          register = absoluteArm({ ...zoomed, roll });
          emit(commitCameraPose(register));
        }
        break;
      }
    }
  }

  return {
    register,
    gesture: gestureMemory,
    tilt,
    follow,
    followDistanceTarget,
    actions,
  };
}
