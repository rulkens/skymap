/**
 * sceneCameraView — resolves the store's `SceneCamera` pose into what a frame
 * draws, in metres: eye/target, screen right/up (read by pan + billboard
 * expansion), fov, viewport.
 *
 * Composes three unit-agnostic utilities (spec §7.3, Q10), not
 * `zoomedDistance`/`orbitRadPerPixel` — both degenerate to a constant with no
 * pivot surface (this tool's only case), and `zoomedDistance` reaches
 * `clampDistance`'s 30000 Mpc ceiling. `clampSceneDistanceM` replaces it.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import type { SceneCamera } from '../state/view/viewSlice';

/** π/4, the same natural-looking default as mcpm-workbench's FOV_Y_RAD. */
const FOV_Y_RAD = Math.PI / 4;

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
  const dir = yawPitchToDir(yaw, pitch); // target → eye
  const eyeM: Vec3 = [
    targetM[0] + distanceM * dir[0],
    targetM[1] + distanceM * dir[1],
    targetM[2] + distanceM * dir[2],
  ];
  const forward: Vec3 = [-dir[0], -dir[1], -dir[2]]; // eye → target
  const { right, up } = imagePlaneBasis(forward, 0, frameUp(undefined));
  return { eyeM, targetM, rightM: right, upM: up, fovYRad: FOV_Y_RAD, viewportPx };
}
