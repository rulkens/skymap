/**
 * SpaceMouseAxes — the canonical 6DOF input shape used everywhere in the
 * SpaceMouse pipeline.
 *
 * ### Why six axes?
 *
 * 3Dconnexion devices (SpaceMouse Compact, Wireless, Pro, Enterprise) emit
 * three translation axes (push the puck) and three rotation axes (twist /
 * tilt / yaw the puck). The hardware decouples them, and so do we: callers
 * can map each axis independently to whatever camera channel they want.
 *
 * ### Coordinate conventions
 *
 * All values live in the [-1, +1] range after parsing/normalisation. Sign
 * follows the puck's perspective when looking down at the desk:
 *
 *   tx = +1  →  puck pushed RIGHT
 *   ty = +1  →  puck pushed UP (away from user, in the plane of the desk)
 *   tz = +1  →  puck pulled UP (out of the desk; lift)
 *   rx = +1  →  puck tilted FORWARD (top edge toward user)
 *   ry = +1  →  puck top edge tilted RIGHT (rolls toward right)
 *   rz = +1  →  puck rotated about its base, top-CW (right-hand turn)
 *
 * These conventions match 3Dconnexion's "Object Mode" defaults and are what
 * the camera mapper in `spaceMouseToCamera.ts` expects.
 *
 * ### Why a plain object, not a class or vec6?
 *
 * The shape stays trivially serialisable, JSON-loggable, and free of any
 * library coupling — useful when we eventually expose this over a debug
 * channel or test it. gl-matrix has no `vec6`; rolling our own would add
 * complexity for zero benefit. A POJO is enough.
 */
export type SpaceMouseAxes = {
  /** Translation along the x axis (push left/right), normalised to [-1, 1]. */
  tx: number;
  /** Translation along the y axis (push forward/back), normalised to [-1, 1]. */
  ty: number;
  /** Translation along the z axis (lift up/push down), normalised to [-1, 1]. */
  tz: number;
  /** Rotation around the x axis (tilt forward/back), normalised to [-1, 1]. */
  rx: number;
  /** Rotation around the y axis (tilt left/right), normalised to [-1, 1]. */
  ry: number;
  /** Rotation around the z axis (turn left/right), normalised to [-1, 1]. */
  rz: number;
};
