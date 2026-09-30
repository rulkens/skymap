/**
 * surfaceStep — the body arm's gesture register as a pure step over its memory
 * (spec §6). Body-fixed metres, no world position, so a fast clock cannot slide
 * the ground under a gesture; every mode moves the pose so the grabbed content
 * follows the cursor, which fixes each sign below. One orientation authority
 * (R1): gestures never create roll. Tilt is Cesium-style (ruling 12): display =
 * `remembered × bodyUpWeight(h/R)`; only tilt/look write it.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { CameraTuning } from '../../@types/camera/CameraTuning';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { InputStep } from '../../@types/camera/InputStep';
import type { SurfaceGestureMemory } from '../../@types/camera/SurfaceGestureMemory';
import type { TiltMemory } from '../../@types/camera/TiltMemory';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { draggedSurfacePose } from '../../utils/camera/draggedSurfacePose';
import { latchSurfaceGesture } from '../../utils/camera/latchSurfaceGesture';
import { settledDragPose } from '../../utils/camera/settledDragPose';
import { surfaceZoomStep } from '../../utils/camera/surfaceZoomStep';

type SurfaceStepCtx = {
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly bodyRadiusM: number;
  /** Descent-floor multiple of the datum (`bodyStandoffRadii`); a body may override the global. */
  readonly standoffRadii: number;
  /** What the floor stands off from, per direction; `bodyRadiusM` keeps the band arithmetic. */
  readonly groundRadiusAtM: GroundRadiusLookup;
  /** Relief shells the gesture/zoom pick marches between (spec §8.1); the datum-sphere
   *  fallback on a miss is the call sites' own policy, not this ctx's. */
  readonly innerBoundRadiusM: number;
  readonly outerBoundRadiusM: number;
  /** Scene-frame up in BODY-FIXED axes (unit); the body rotates under it, so resample per drain. */
  readonly sceneUpLocal: Readonly<Vec3>;
  /** A focus HOSTED on this body, body-fixed metres — it owns the zoom's pivot. */
  readonly focusPivotM: Readonly<Vec3> | null;
  readonly tuning: CameraTuning;
};

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
