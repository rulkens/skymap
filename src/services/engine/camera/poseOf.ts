/**
 * poseOf — extract the orbit params from a live OrbitCamera as a CameraPose.
 *
 * An OrbitCamera carries projection geometry (fovYRad, aspect, near, far) and
 * a derived world-space position alongside the four orbit parameters that
 * camera drivers actually author (target, yaw, pitch, distance). This helper
 * drops projection + position and returns only what a CameraPose carries.
 *
 * The target is copied into a fresh array so the returned pose never aliases
 * the camera's mutable target field — callers can hold the pose across a frame
 * boundary without risk of the camera advancing under them.
 */

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { CameraPose } from '../../../@types/camera/CameraPose';

export function poseOf(cam: OrbitCamera): CameraPose {
  return {
    target: [cam.target[0], cam.target[1], cam.target[2]],
    yaw: cam.yaw,
    pitch: cam.pitch,
    distance: cam.distance,
    roll: cam.roll,
  };
}
