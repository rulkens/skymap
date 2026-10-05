/**
 * CAMERA_PROJECTIONS — one row per `CameraProjection` kind: pose → view, view → matrix and
 * pixel scale. The bake is ENU (+Z up); `yawPitchToDir`/`frameUp` decode Y-up, so
 * `ENU_UP_BASIS` — a determinant-+1 axis cycle, not a mirroring swap — rotates into world.
 */
import { mat4 } from 'wgpu-matrix';

import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { cross3 } from '../../../../src/utils/math/cross3';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import type { CameraProjection } from '../../@types/CameraProjection';
import type { CameraProjectionRow } from '../../@types/CameraProjectionRow';

// Local (Y-up) → world (Z-up ENU) basis, as columns [local+X, local+Y, local+Z]
// expressed in world: local+X→world+Y, local+Y (zenith)→world+Z (up),
// local+Z (yaw=0 ray)→world+X (yaw=0 puts the eye on the target's +X side).
const ENU_UP_BASIS: Mat3 = mat3FromColumns([0, 1, 0], [0, 0, 1], [1, 0, 0]);

/** π/4 matches mcpm-workbench; near/far span hand-scale detail to the ~2.5 km scene diagonal. */
const PERSPECTIVE = {
  kind: 'perspective',
  fovYRad: Math.PI / 4,
  nearM: 0.5,
  farM: 5000,
} as const satisfies CameraProjection;

// A fixed standoff, not the group's Z bounds: scenes are tens of metres tall, and depth24
// over this 2 km slab is still sub-millimetre.
const ORTHO_EYE_ABOVE_TARGET_M = 1000;
const ORTHO_NEAR_M = 1;
const ORTHO_FAR_M = 2000;

export const CAMERA_PROJECTIONS: {
  readonly [K in CameraProjection['kind']]: CameraProjectionRow<
    Extract<CameraProjection, { kind: K }>
  >;
} = {
  perspective: {
    view(camera, viewportPx) {
      const { yaw, pitch, distanceM, targetM } = camera;
      const dirLocal = yawPitchToDir(yaw, pitch); // target → eye, Y-up frame-local
      const dir = rotateVec3ByTightMat3(dirLocal, ENU_UP_BASIS); // → world (Z-up)
      const eyeM: Vec3 = [
        targetM[0] + distanceM * dir[0],
        targetM[1] + distanceM * dir[1],
        targetM[2] + distanceM * dir[2],
      ];
      const forward: Vec3 = [-dir[0], -dir[1], -dir[2]]; // eye → target
      const { right, up } = imagePlaneBasis(forward, 0, frameUp(ENU_UP_BASIS));
      return { eyeM, targetM, rightM: right, upM: up, projection: PERSPECTIVE, viewportPx };
    },
    matrix: (p, aspect, dst) => mat4.perspective(p.fovYRad, aspect, p.nearM, p.farM, dst),
    metresPerPx: (p, heightPx) => (2 * Math.tan(p.fovYRad * 0.5)) / heightPx,
  },
  orthographic: {
    // Built directly, never via pitch ±π/2: `lookAt` degenerates looking straight down.
    // Pitch is ignored; `distanceM` is the zoom register — the half-height matches the
    // perspective view's at its target, so switching projection keeps the scale on screen.
    view(camera, viewportPx) {
      const { yaw, distanceM, targetM } = camera;
      const level = rotateVec3ByTightMat3(yawPitchToDir(yaw, 0), ENU_UP_BASIS); // Z exactly 0
      const upM: Vec3 = [-level[0], -level[1], 0];
      const eyeM: Vec3 = [targetM[0], targetM[1], targetM[2] + ORTHO_EYE_ABOVE_TARGET_M];
      return {
        eyeM,
        targetM,
        rightM: cross3([0, 0, -1], upM),
        upM,
        projection: {
          kind: 'orthographic',
          halfHeightM: distanceM * Math.tan(PERSPECTIVE.fovYRad * 0.5),
          nearM: ORTHO_NEAR_M,
          farM: ORTHO_FAR_M,
        },
        viewportPx,
      };
    },
    matrix: (p, aspect, dst) => {
      const h = p.halfHeightM;
      return mat4.ortho(-h * aspect, h * aspect, -h, h, p.nearM, p.farM, dst);
    },
    metresPerPx: (p, heightPx) => (2 * p.halfHeightM) / heightPx, // clip w is 1
  },
};
