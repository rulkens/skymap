import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';

/** The box's own three world-space unit axis directions — mirrors CameraBasis's
 * named-triplet shape (no matrices anywhere in the tool). */
export type BoxBasis = {
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
};
