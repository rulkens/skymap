import type { BodyFixedPose } from './BodyFixedPose';
import type { InputStep } from './InputStep';
import type { SurfaceGesture } from './SurfaceGesture';
import type { Vec2 } from '../math/Vec2';

/**
 * The body arm's input register (spec §6): `drainInput` hands it this frame's
 * steps and commits the pose that comes back. Its only state is the latched
 * gesture, which dies at pointerup — no target survives a gesture, so FW-H's
 * accumulating pivot is unreachable rather than handled.
 */
export type SurfaceController = {
  readonly apply: (
    arm: BodyFixedPose,
    step: InputStep,
    viewportPx: Readonly<Vec2>,
    fovYRad: number,
    bodyRadiusM: number,
  ) => BodyFixedPose;
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
  /**
   * Read-only view of the live latch for the debug readout: null with the
   * pointer up, `mode: null` between press and the first latching drag step.
   */
  readonly debugGesture: () => { readonly gesture: SurfaceGesture | null } | null;
};
