/**
 * hrOfPose — altitude ratio h/R of an explicit eye vs `body`. The pure core
 * `hrOverBody` reads off the displayed eye; the register-loop fixtures call
 * this directly against the AUTHORED (pre-projection) eye.
 */

import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function hrOfPose(eye: Readonly<Vec3>, body: BodyState, radiusM: number): number {
  const d = Math.hypot(
    eye[0] - body.positionMpc[0]!,
    eye[1] - body.positionMpc[1]!,
    eye[2] - body.positionMpc[2]!,
  );
  return d / (radiusM * SCALE_UNITS.M_TO_MPC) - 1;
}
