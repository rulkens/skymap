import type { BodyFixedPose } from './BodyFixedPose';
import type { InputStep } from './InputStep';
import type { SurfaceGesture } from './SurfaceGesture';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

/**
 * The body arm's input register (spec §6): `drainInput` hands it this frame's
 * steps and commits the pose that comes back. Its state is the latched
 * gesture (dies at pointerup — no target survives a gesture, so FW-H's
 * accumulating pivot is unreachable rather than handled) plus the session's
 * remembered tilt (ruling 12), which by design DOES survive gestures,
 * disengage and re-engage.
 */
export type SurfaceController = {
  readonly apply: (
    arm: BodyFixedPose,
    step: InputStep,
    viewportPx: Readonly<Vec2>,
    fovYRad: number,
    bodyRadiusM: number,
    /**
     * The configured scene frame's up, expressed in BODY-FIXED axes (unit) —
     * the band top of the settle's reference-up blend (ruling 8, round 5).
     * Time-dependent (the body rotates under it); the caller resamples per
     * drain.
     */
    sceneUpLocal: Readonly<Vec3>,
  ) => BodyFixedPose;
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
  /**
   * Read-only view of the live latch for the debug readout: null with the
   * pointer up, `mode: null` between press and the first latching drag step.
   */
  readonly debugGesture: () => { readonly gesture: SurfaceGesture | null } | null;
  /**
   * The Cesium-style remembered tilt (ruling 12): last tilt the user SET via
   * a tilt/look drag in the body regime, un-mapped through the band weight;
   * 0 until set. Read-only — the controller's drag path is the only writer.
   */
  readonly rememberedTiltRad: () => number;
};
