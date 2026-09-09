import type { BodyFixedPose } from './BodyFixedPose';
import type { InputStep } from './InputStep';
import type { SurfaceGesture } from './SurfaceGesture';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

/**
 * The body arm's input register (spec §6): `drainInput` hands it this frame's
 * steps and commits the pose that comes back. State = the latched gesture
 * (dies at pointerup) + the session's remembered tilt (ruling 12).
 */
export type SurfaceController = {
  readonly apply: (
    arm: BodyFixedPose,
    step: InputStep,
    viewportPx: Readonly<Vec2>,
    fovYRad: number,
    bodyRadiusM: number,
    /** Scene-frame up in BODY-FIXED axes (unit); the body rotates under it, so resample per drain. */
    sceneUpLocal: Readonly<Vec3>,
  ) => BodyFixedPose;
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
  /** The live latch for the debug readout: null with the pointer up. */
  readonly debugGesture: () => { readonly gesture: SurfaceGesture | null } | null;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: () => number;
  /** Once per frame with the camera's current body; a DIFFERENT body wipes the memory (ruling 18), null keeps it. */
  readonly noteBody: (bodyId: string | null) => void;
};
