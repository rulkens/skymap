/**
 * sceneCameraView — resolves the store's `SceneCamera` pose into what a frame
 * draws, in metres: eye/target, screen right/up (pan + billboard basis),
 * projection, viewport. Skips `zoomedDistance`/`orbitRadPerPixel` (spec §7.3) —
 * `clampSceneDistanceM` replaces their 30000 Mpc ceiling.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { CameraProjection } from '../../@types/CameraProjection';
import type { SceneCamera } from '../state/view/viewSlice';
import { CAMERA_PROJECTIONS } from './cameraProjections';

export type SceneCameraView = {
  readonly eyeM: Vec3;
  readonly targetM: Vec3;
  readonly rightM: Vec3;
  readonly upM: Vec3;
  readonly projection: CameraProjection;
  readonly viewportPx: readonly [number, number];
};

export function sceneCameraView(
  camera: SceneCamera,
  viewportPx: readonly [number, number],
): SceneCameraView {
  return CAMERA_PROJECTIONS['perspective'].view(camera, viewportPx);
}
