import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';

/** The box's own three world-space unit axis directions — mirrors CameraBasis's
 * named-triplet shape (spec §2's non-goal: no matrices anywhere in the tool). */
export type BoxBasis = {
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
};

/**
 * boxBasisVectors — `rotation` applied (not its conjugate: this rotates a
 * direction FROM box-local INTO world, the same leg `boxLocalToWorld` uses for
 * positions) to each unit coordinate axis. Feeds both `boxLines.wesl`'s corner
 * reconstruction and the gizmo's own translate/resize/rotate handle axes.
 */
export function boxBasisVectors(rotation: Readonly<Vec4>): BoxBasis {
  return {
    x: rotateVec3ByQuat(rotation, [1, 0, 0]),
    y: rotateVec3ByQuat(rotation, [0, 1, 0]),
    z: rotateVec3ByQuat(rotation, [0, 0, 1]),
  };
}
