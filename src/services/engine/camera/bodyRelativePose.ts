/**
 * bodyRelativePose — provider A: re-express the world-space (Mpc, heliocentric)
 * camera in one body's own FIXED frame, in SI metres.
 *
 * `camPosMpc` and `bodyState.positionMpc` share the body's large heliocentric
 * magnitude; subtracting FIRST, in Mpc, lets f64 cancel that shared magnitude
 * before `MPC_TO_M` scales the small remainder up to metres. Scaling each
 * operand to metres first would blow up the shared magnitude's rounding error
 * by the same factor, before the cancellation ever gets a chance — see spec §5.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';
import { SCALE_UNITS } from '../../../data/scaleUnits';

// orientationᵀ · v: `orientation` is orthonormal, so its transpose is its
// inverse, and column c of a transpose is row c of the original — i.e. this
// is just the three column·v dot products, no separate transpose step needed.
function rotateByTranspose(orientation: Readonly<Mat3>, v: Readonly<Vec3>): Vec3 {
  return [
    orientation[0] * v[0] + orientation[1] * v[1] + orientation[2] * v[2],
    orientation[3] * v[0] + orientation[4] * v[1] + orientation[5] * v[2],
    orientation[6] * v[0] + orientation[7] * v[1] + orientation[8] * v[2],
  ];
}

export function bodyRelativePose(input: {
  readonly bodyId: BodyId;
  readonly camPosMpc: Readonly<Vec3>;
  readonly camBasisWorld: Readonly<Mat3>;
  readonly bodyState: BodyState;
}): BodyRelativePose {
  // bodyId is carried for the caller's benefit (identity checks); it never
  // enters the arithmetic below.
  const { camPosMpc, camBasisWorld, bodyState } = input;
  const { positionMpc, orientation } = bodyState;

  const deltaMpc: Vec3 = [
    camPosMpc[0] - positionMpc[0],
    camPosMpc[1] - positionMpc[1],
    camPosMpc[2] - positionMpc[2],
  ];
  const deltaM: Vec3 = [
    deltaMpc[0] * SCALE_UNITS.MPC_TO_M,
    deltaMpc[1] * SCALE_UNITS.MPC_TO_M,
    deltaMpc[2] * SCALE_UNITS.MPC_TO_M,
  ];
  const eyeRelBodyM = rotateByTranspose(orientation, deltaM);

  const right = rotateByTranspose(orientation, [
    camBasisWorld[0],
    camBasisWorld[1],
    camBasisWorld[2],
  ]);
  const up = rotateByTranspose(orientation, [
    camBasisWorld[3],
    camBasisWorld[4],
    camBasisWorld[5],
  ]);
  const forward = rotateByTranspose(orientation, [
    camBasisWorld[6],
    camBasisWorld[7],
    camBasisWorld[8],
  ]);
  const basisM: Mat3 = [
    right[0],
    right[1],
    right[2],
    up[0],
    up[1],
    up[2],
    forward[0],
    forward[1],
    forward[2],
  ];

  return { eyeRelBodyM, basisM };
}
