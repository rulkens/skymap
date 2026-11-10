/**
 * FieldView — the analytic field's camera, in the GALAXY frame (centre at
 * the origin, disc in xz, +Y the pole, model units). A basis plus frustum
 * tangents rather than a view matrix: every field pass builds rays from it
 * (`packFieldHeaderUniforms`, `lib/camera.wesl`'s `cameraRayFromNdc`).
 */

import type { ViewFrustum } from '../../../../@types/camera/projection/ViewFrustum';
import type { Vec3 } from '../../../../@types/math/Vec3';

export type FieldView = {
  readonly eye: Vec3;
  readonly right: Vec3; // unit
  readonly up: Vec3; // unit
  readonly fwd: Vec3; // unit, into the screen
  /** The full projection's, never a reduced target's: a divisor-scaled target still reconstructs the
   *  frustum `proj` was built with. Carries any lens shift (tanLeft/tanDown ≤ 0 when centred). */
  readonly frustum: ViewFrustum;
};
