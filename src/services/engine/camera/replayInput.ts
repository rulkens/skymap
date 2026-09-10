/**
 * replayInput — one frame's input steps folded over the camera runtime, pure:
 * the new register/surface/follow memories plus the actions the drain would
 * have dispatched, in order. Each step reads the EFFECTIVE intent — the frame's
 * store snapshot with the actions emitted so far folded through the real camera
 * reducer — so a step sees the commit the step before it made, exactly as the
 * incumbent's fresh `getState()` per step did. The store commits only at
 * gesture end and per at-rest notch; a following camera's notch rides the
 * return as `followDistanceTarget` instead.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

import { applyInputToCamera } from '../../camera/applyInputToCamera';
import { surfaceStep } from '../../camera/surfaceStep';
import { surfaceGestureEdge } from '../../../utils/camera/surfaceGestureEdge';
import { applyWheelZoom } from './applyWheelZoom';
import { advanceEpoch, elapsedMs } from './cameraEpochs';
import { frameAlignedRoll } from './frameAlignedRoll';
import { pivotFraming } from './pivotRadiusMpc';
import { resolveWorldArm } from './poseFrameConversion';
import { zoomedDistance } from '../../../utils/camera/zoomedDistance';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { frameUp } from '../../../utils/camera/frameUp';
import { isFollowDriverId } from '../../../utils/camera/isFollowDriverId';
import { rotateVec3ByTightMat3T } from '../../../utils/math/rotateVec3ByTightMat3T';
import { selectFocusRow } from '../../../state/selection/selectors';
import cameraReducer, { endDrag, commitCameraPose } from '../../../state/camera/cameraSlice';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { DriverId } from '../../../@types/engine/camera/DriverId';
import type { Epoch } from '../../../@types/engine/camera/Epoch';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { InputStep } from '../../../@types/camera/InputStep';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { SurfaceMemory } from '../../../@types/camera/SurfaceMemory';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { RootState } from '../../../store/types';

export function replayInput(
  prev: {
    readonly register: FramedCameraPose;
    readonly surface: SurfaceMemory;
    readonly follow: FollowMemory | null;
  },
  steps: readonly InputStep[],
  ctx: {
    readonly rootState: RootState;
    readonly nowMs: number;
    readonly canvasPx: Readonly<Vec2>;
    readonly projection: CameraProjection;
    readonly upBasis: Readonly<Mat3>;
    readonly poseBasis: Readonly<Mat3>;
    readonly bodies: ReadonlyMap<BodyId, BodyState>;
    readonly winnerLastFrame: DriverId;
    readonly autoRotateEpoch: Epoch<FramedCameraPose>;
  },
): {
  readonly register: FramedCameraPose;
  readonly surface: SurfaceMemory;
  readonly follow: FollowMemory | null;
  /** The last zoom step's factor; null when the drain held no zoom. */
  readonly lastZoomFactor: number | null;
  readonly followDistanceTarget: number | null;
  readonly actions: readonly UnknownAction[];
} {
  const { rootState, nowMs, canvasPx, projection, upBasis, poseBasis, bodies, winnerLastFrame } =
    ctx;
  const cssHeight = canvasPx[1];
  // Only camera actions are emitted mid-drain, so every other slice is the
  // snapshot's; the focus row is read once.
  const focus = selectFocusRow(rootState);
  const pivot = pivotFraming(focus);

  // The accumulator. EVERY step writes the register so a later step in the same
  // drain chains from it — an at-rest notch left out of it would be folded over
  // and silently discarded by a drag arriving in the same frame window.
  let register = prev.register;
  let surface = prev.surface;
  let follow = prev.follow;
  let lastZoomFactor: number | null = null;
  let followDistanceTarget: number | null = null;
  // Advanced locally for this frame's elapsed read and DISCARDED: handing it to
  // `advanceEpochs` would keep a fold-time reset when another driver wins.
  let autoRotateEpoch = ctx.autoRotateEpoch;
  let camera = rootState.camera;
  const actions: UnknownAction[] = [];
  const emit = (action: UnknownAction): void => {
    actions.push(action);
    camera = cameraReducer(camera, action);
  };

  /**
   * The engaged arm's input owner (spec §6). The GATE is the stored regime
   * (`base.frame`); the POSE is the live register, because the fold commits on
   * a regime EDGE only — mid-tween `base` holds the last crossing pose while the
   * register tracks the animation (FW-G).
   */
  const routeToSurface = (step: InputStep): boolean => {
    const base = camera.base;
    if (base.frame === 'absolute') return false;
    // A playing clip owns the camera in both arms (the driver table's rule).
    if (camera.clip !== null) return true;
    const body = SCENE_BODIES.find((row) => row.id === base.frame.body);
    if (body === undefined) return true;
    const from =
      register.frame !== 'absolute' && register.frame.body === base.frame.body
        ? register.pose
        : base.pose;
    // Scene up in the body's fixed axes for the settle's band blend; a missing
    // body degrades to the pole (the blend collapses to the body ENU).
    const bodyState = bodies.get(base.frame.body);
    const sceneUpLocal: Vec3 = bodyState
      ? rotateVec3ByTightMat3T(frameUp(upBasis), bodyState.orientation)
      : [0, 0, 1];
    const { pose: next, next: memory } = surfaceStep(surface, from, step, {
      viewportPx: canvasPx,
      fovYRad: projection.fovYRad,
      bodyRadiusM: body.radiusM,
      sceneUpLocal,
    });
    surface = memory;
    register = { frame: base.frame, pose: next };
    // An at-rest notch is its own atomic gesture, so its commit is its gesture
    // end (the resting driver renders `base`, not the register). Identity, not
    // equality: a declined step returns its input by reference.
    if (step.kind === 'zoom' && !step.duringGesture && next !== from) {
      emit(commitCameraPose(register));
    }
    return true;
  };

  const applyWorldStep = (step: Extract<InputStep, { kind: 'drag' } | { kind: 'zoom' }>): void => {
    // A playing clip is not gesture-interruptible: swallowed, not folded under it.
    if (camera.clip !== null) return;
    // AUTHORED, not displayed (R12b-1): the drag composes below the tilt.
    const world = resolveWorldArm(register, bodies, poseBasis, upBasis);
    let next = applyInputToCamera(
      world,
      step,
      cssHeight,
      pivot,
      projection.fovYRad,
      poseBasis,
      upBasis,
    );
    if (step.kind === 'zoom') {
      // The roll ride runs on every driven zoom path, gesture-held included.
      const roll = frameAlignedRoll(world, next, bodies, poseBasis, upBasis);
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
        // The gesture boundaries are the memory's `pointerDown` edges; the latch
        // is taken by the first drag step, which carries the press pixel.
        surface = surfaceGestureEdge(surface, true);
        break;

      case 'gestureEnd': {
        // ONE commit site for both arms: bake the register into `base` before
        // `endDrag`. Skipped while a clip owns the camera and across an arm
        // mismatch — the fold owns regime edges; a commit here must never flip one.
        const sameArm =
          register.frame === 'absolute'
            ? camera.base.frame === 'absolute'
            : camera.base.frame !== 'absolute' && register.frame.body === camera.base.frame.body;
        if (camera.clip === null && sameArm) emit(commitCameraPose(register));
        surface = surfaceGestureEdge(surface, false);
        emit(endDrag());
        break;
      }

      case 'drag':
        if (!routeToSurface(step)) applyWorldStep(step);
        break;

      case 'zoom': {
        lastZoomFactor = step.factor;
        // In a body arm both zoom owners route to the anchored step (§7).
        if (routeToSurface(step)) break;
        if (step.duringGesture) {
          applyWorldStep(step);
          break;
        }
        // A follow row re-asserts its own target every frame and would swallow
        // a committed base, so its notch is resolved to a distance the driver
        // adopts; a second notch in the same drain resolves off the first.
        const followTargetBefore = followDistanceTarget ?? follow?.distanceTarget ?? null;
        if (
          camera.base.frame === 'absolute' &&
          isFollowDriverId(winnerLastFrame) &&
          followTargetBefore !== null
        ) {
          followDistanceTarget = zoomedDistance(followTargetBefore, step.factor, pivot);
          // Ruling 8: the ride's authored altitude move IS that target change —
          // the live pose twice gave a zero delta and froze the band roll. It
          // lands on `base.roll`, the term the follow pose lerps toward.
          const basePose = camera.base.pose;
          const live = resolveWorldArm(register, bodies, poseBasis, upBasis);
          const roll = frameAlignedRoll(
            { ...live, distance: followTargetBefore },
            { ...live, distance: followDistanceTarget },
            bodies,
            poseBasis,
            upBasis,
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
        if (zoomed !== null && camera.base.frame === 'absolute') {
          // `base` is centre-looking by wiring (R12-1), so the pre/post pair is
          // self-consistent under an autoRotate-owned notch too.
          const roll = frameAlignedRoll(camera.base.pose, zoomed, bodies, poseBasis, upBasis);
          register = absoluteArm({ ...zoomed, roll });
          emit(commitCameraPose(register));
        }
        break;
      }
    }
  }

  return {
    register,
    surface,
    follow,
    lastZoomFactor,
    followDistanceTarget,
    actions,
  };
}
