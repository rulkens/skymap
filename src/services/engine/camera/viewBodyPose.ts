/**
 * viewBodyPose — a `ViewSpec`'s turn and eye offset applied to either body-pose
 * provider's output, so an engaged body arm keeps its metre-native path in
 * every view. A seam file of its own: the offset crosses Mpc → m
 * (`oneMpcSeam.test.ts`).
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { multiply3x3 } from '../../../utils/math/multiply3x3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';

export function viewBodyPose(
  pose: BodyRelativePose,
  rotation: Readonly<Mat3>,
  eyeOffsetMpc: Readonly<Vec3>,
): BodyRelativePose {
  const basisM = multiply3x3(pose.basisM, rotation);
  const offsetM = rotateVec3ByTightMat3(
    [
      eyeOffsetMpc[0] * SCALE_UNITS.MPC_TO_M,
      eyeOffsetMpc[1] * SCALE_UNITS.MPC_TO_M,
      eyeOffsetMpc[2] * SCALE_UNITS.MPC_TO_M,
    ],
    basisM,
  );
  const { eyeRelBodyM: e } = pose;
  return { eyeRelBodyM: [e[0] + offsetM[0], e[1] + offsetM[1], e[2] + offsetM[2]], basisM };
}
