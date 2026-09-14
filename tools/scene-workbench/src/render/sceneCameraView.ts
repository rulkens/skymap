/**
 * sceneCameraView — resolves the store's `SceneCamera` pose into what a frame
 * draws, in metres: eye/target, screen right/up (pan + billboard basis), fov,
 * viewport. Skips `zoomedDistance`/`orbitRadPerPixel` (spec §7.3) — both
 * degenerate to a constant absent a pivot surface, and `zoomedDistance`'s
 * `clampDistance` reaches a 30000 Mpc ceiling; `clampSceneDistanceM` replaces it.
 * The bake is ENU (`+proj=topocentric`, +Z up); `yawPitchToDir`/`frameUp`
 * decode Y-up, so `ENU_UP_BASIS` — a determinant-+1 axis cycle, not a
 * mirroring swap — rotates the decode into world +Z-up before use.
 */
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import type { SceneCamera } from '../state/view/viewSlice';

/** π/4, the same natural-looking default as mcpm-workbench's FOV_Y_RAD. */
const FOV_Y_RAD = Math.PI / 4;

// Local (Y-up) → world (Z-up ENU) basis, as columns [local+X, local+Y, local+Z]
// expressed in world: local+X→world+Y, local+Y (zenith)→world+Z (up),
// local+Z (yaw=0 ray)→world+X (yaw=0 puts the eye on the target's +X side).
// A cyclic axis permutation, determinant +1.
const ENU_UP_BASIS: Mat3 = mat3FromColumns([0, 1, 0], [0, 0, 1], [1, 0, 0]);

export type SceneCameraView = {
  readonly eyeM: Vec3;
  readonly targetM: Vec3;
  readonly rightM: Vec3;
  readonly upM: Vec3;
  readonly fovYRad: number;
  readonly viewportPx: readonly [number, number];
};

export function sceneCameraView(
  camera: SceneCamera,
  viewportPx: readonly [number, number],
): SceneCameraView {
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
  return { eyeM, targetM, rightM: right, upM: up, fovYRad: FOV_Y_RAD, viewportPx };
}
