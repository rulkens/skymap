import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { ViewSlice } from '../../@types/ViewSlice';
import type { McpmCameraView } from './writeMcpmCamera';

const FOV_Y_RAD = Math.PI / 4;
const CAMERA_UP: Vec3 = [0, 1, 0];

/**
 * The one camera every view resolves from: an overlay off by a frame's basis is a lie.
 * Takes the pose directly (not `RootState`) so a caller mid-gesture can pass the input
 * module's live drag register instead of the not-yet-committed store value.
 */
export function cameraViewFor(
  camera: ViewSlice['camera'],
  viewportPx: readonly [number, number],
): McpmCameraView {
  const { yaw, pitch, distance, targetMpc } = camera;
  const cosPitch = Math.cos(pitch);
  const eyeMpc: Vec3 = [
    targetMpc[0] + distance * cosPitch * Math.sin(yaw),
    targetMpc[1] + distance * Math.sin(pitch),
    targetMpc[2] + distance * cosPitch * Math.cos(yaw),
  ];
  return { eyeMpc, targetMpc, upMpc: CAMERA_UP, fovYRad: FOV_Y_RAD, viewportPx };
}
