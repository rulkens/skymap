import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import type { GridBox } from '../../@types/GridBox';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';

/** An orthonormal right-handed frame: `forward` looks at the target, `up` is re-derived. */
export type CameraBasis = {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
};

/**
 * cameraBasis — the frame every mcpm view projects through, shared so the raymarch, the
 * agent splat and the galaxy overlay cannot drift apart on screen.
 *
 * Built in world space, then rotated into box-local by R⁻¹ (conjugate of box.rotation) —
 * the same leg worldToBoxLocal applies to positions, since GridBox voxels are cubic by
 * construction and a rotated box's directions need R⁻¹ too (rotation doesn't commute with
 * the uniform-scale shortcut this used to rely on).
 */
export function cameraBasis(
  eyeMpc: Readonly<Vec3>,
  targetMpc: Readonly<Vec3>,
  upMpc: Readonly<Vec3>,
  box: GridBox,
): CameraBasis {
  const forward = normalize3([
    targetMpc[0] - eyeMpc[0],
    targetMpc[1] - eyeMpc[1],
    targetMpc[2] - eyeMpc[2],
  ]);
  // A camera looking straight along 'up' collapses the cross product; fall back to an axis
  // forward is not aligned with so the basis stays finite.
  const sideways = cross3(forward, upMpc);
  const right = normalize3(
    Math.hypot(sideways[0], sideways[1], sideways[2]) > 1e-6
      ? sideways
      : cross3(forward, Math.abs(forward[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]),
  );
  const up = cross3(right, forward);
  const [x, y, z, w] = box.rotation;
  const conjugate: Vec4 = [-x, -y, -z, w];
  return {
    right: rotateVec3ByQuat(conjugate, right),
    up: rotateVec3ByQuat(conjugate, up),
    forward: rotateVec3ByQuat(conjugate, forward),
  };
}
