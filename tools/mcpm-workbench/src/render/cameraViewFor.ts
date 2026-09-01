import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { RootState } from '../store/types';
import type { McpmCameraView } from './writeMcpmCamera';

const FOV_Y_RAD = Math.PI / 4;
const CAMERA_UP: Vec3 = [0, 1, 0];

/** The one camera every view resolves from: an overlay off by a frame's basis is a lie. */
export function cameraViewFor(s: RootState, viewportPx: readonly [number, number]): McpmCameraView {
  const { yaw, pitch, distance, targetMpc } = s.view.camera;
  const cosPitch = Math.cos(pitch);
  const eyeMpc: Vec3 = [
    targetMpc[0] + distance * cosPitch * Math.sin(yaw),
    targetMpc[1] + distance * Math.sin(pitch),
    targetMpc[2] + distance * cosPitch * Math.cos(yaw),
  ];
  return { eyeMpc, targetMpc, upMpc: CAMERA_UP, fovYRad: FOV_Y_RAD, viewportPx };
}
