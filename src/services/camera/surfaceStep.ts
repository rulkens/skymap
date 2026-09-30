/**
 * surfaceStep — the body arm's gesture register as a pure step over its memory
 * (spec §6). Body-fixed metres, no world position, so a fast clock cannot slide
 * the ground under a gesture; every mode moves the pose so the grabbed content
 * follows the cursor, which fixes each sign below. One orientation authority
 * (R1): gestures never create roll. Tilt is Cesium-style (ruling 12): display =
 * `remembered × bodyUpWeight(h/R)`; only tilt/look write it.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { InputStep } from '../../@types/camera/InputStep';
import type { SurfaceStepCtx } from '../../@types/camera/SurfaceStepCtx';
import type { SurfaceGestureMemory } from '../../@types/camera/SurfaceGestureMemory';
import type { TiltMemory } from '../../@types/camera/TiltMemory';
import { draggedSurfacePose } from '../../utils/camera/draggedSurfacePose';
import { latchSurfaceGesture } from '../../utils/camera/latchSurfaceGesture';
import { settledDragPose } from '../../utils/camera/settledDragPose';
import { surfaceZoomStep } from '../../utils/camera/surfaceZoomStep';

/** The body rung's empty memory. */
export const EMPTY_SURFACE_GESTURE_MEMORY: SurfaceGestureMemory = { gesture: null };

export function surfaceStep(
  prev: SurfaceGestureMemory,
  tilt: TiltMemory,
  arm: BodyFixedPose,
  step: InputStep,
  ctx: SurfaceStepCtx,
): {
  readonly pose: BodyFixedPose;
  readonly gesture: SurfaceGestureMemory;
  readonly tilt: TiltMemory;
} {
  const {
    viewportPx,
    fovYRad,
    bodyRadiusM,
    standoffRadii,
    groundRadiusAtM,
    innerBoundRadiusM,
    outerBoundRadiusM,
    sceneUpLocal,
    focusPivotM,
    tuning,
  } = ctx;
  if (step.kind === 'zoom') {
    return {
      pose: surfaceZoomStep(
        arm,
        prev.gesture === 'down' ? null : prev.gesture,
        step.factor,
        step.cursorPx,
        viewportPx,
        fovYRad,
        bodyRadiusM,
        standoffRadii,
        groundRadiusAtM,
        innerBoundRadiusM,
        outerBoundRadiusM,
        sceneUpLocal,
        tilt.rememberedTiltRad,
        tuning,
        focusPivotM,
      ),
      gesture: prev,
      tilt,
    };
  }
  // The press and release reach the memory at `replayInput`'s two gesture
  // edges; nothing latches here from idle.
  if (step.kind !== 'drag' || prev.gesture === null) return { pose: arm, gesture: prev, tilt };
  const gesture =
    prev.gesture === 'down'
      ? latchSurfaceGesture(
          arm,
          step,
          viewportPx,
          fovYRad,
          bodyRadiusM,
          groundRadiusAtM,
          innerBoundRadiusM,
          outerBoundRadiusM,
        )
      : prev.gesture;
  const { pose, mode } = draggedSurfacePose(arm, gesture, step, viewportPx, fovYRad);
  // One floor site, after every position write — `anchoredZoomStep` owns its
  // own, so the zoom arm above is already floored.
  const settled = settledDragPose(arm, pose, mode, tilt, {
    groundRadiusAtM,
    standoffRadii,
    bodyRadiusM,
    tuning,
  });
  return {
    pose: settled.pose,
    gesture: { gesture: { ...gesture, mode, prevPixel: step.endPx } },
    tilt: settled.tilt,
  };
}
