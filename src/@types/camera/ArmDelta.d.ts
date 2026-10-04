import type { Vec2 } from '../math/Vec2';

/**
 * One frame's pixel-free motion. orbit/look/roll are SCREEN radians (a drag of
 * one CSS height = one fovY), signed as the pixel drag (+x = rightward, +y =
 * downward); zoom is ln(distance factor), > 0 = farther. Absent axis = no motion.
 */
export type ArmDelta = {
  readonly orbit?: Vec2;
  readonly look?: Vec2;
  readonly zoom?: number;
  readonly roll?: number;
};
