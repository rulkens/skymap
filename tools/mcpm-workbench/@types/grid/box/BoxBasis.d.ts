import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/** The box's own three world-space unit axis directions — mirrors CameraBasis's
 * named-triplet shape (spec §2's non-goal: no matrices anywhere in the tool). */
export type BoxBasis = {
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
};
