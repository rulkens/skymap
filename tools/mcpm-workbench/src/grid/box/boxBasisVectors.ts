import type { Vec4 } from '../../../../../packages/shared/src/@types/math/Vec4';
import { rotateVec3ByQuat } from '../../../../../packages/shared/src/utils/math/rotateVec3ByQuat';
import type { BoxBasis } from '../../../@types/grid/box/BoxBasis';

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
