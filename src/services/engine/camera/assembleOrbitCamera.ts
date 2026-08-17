/**
 * assembleOrbitCamera — the read-side bridge from store Intent to the renderer's
 * camera struct.
 *
 * A CameraPose stored in the Redux slice carries only the orbit parameters the
 * user or a driver produced (target, yaw, pitch, distance).  The renderer needs
 * a live OrbitCamera: those same parameters PLUS the projection Resource
 * (fovYRad, aspect, near, far) and a derived world-space position.
 *
 * This helper merges the two inputs and computes position via updatePosition so
 * every downstream consumer gets a ready-to-use OrbitCamera without repeating
 * that logic.  It is pure: pose and projection are never mutated.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import { updatePosition } from '../../../utils/camera/updatePosition';

/**
 * Lift a store CameraPose into a full live OrbitCamera by merging the engine
 * projection Resource and deriving the world-space camera position.
 *
 * The returned camera is a fresh object with its own writable position vector
 * and a fresh target array — it does NOT alias any field of the (potentially
 * frozen) store pose.
 *
 * `poseBasis` and `upBasis` are the two halves of the former single
 * `frameBasis` field (see `OrbitCameraInit.d.ts`): `poseBasis` is what
 * `updatePosition` decodes yaw/pitch through, `upBasis` is what draw-time
 * screen-up reads. At rest they're equal; during an orientation-frame roll
 * `runFrame` feeds the committed `poseBasis` (holds still) and the live
 * mid-slerp `upBasis` (rotates), which is what makes a roll turn the horizon
 * without moving the eye.
 */
export function assembleOrbitCamera(
  pose: CameraPose,
  projection: CameraProjection,
  poseBasis: Mat3,
  upBasis: Mat3,
): OrbitCamera {
  const cam: OrbitCamera = {
    // Fresh target copy — never alias the store's frozen pose array.
    target: [pose.target[0], pose.target[1], pose.target[2]],
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
    fovYRad: projection.fovYRad,
    aspect: projection.aspect,
    near: projection.near,
    far: projection.far,
    // Set before updatePosition so the derived position decodes through
    // poseBasis (dir_world = poseBasis · dir_local).
    poseBasis,
    upBasis,
    // Writable position tuple; updatePosition fills it before we return.
    position: [0, 0, 0],
  };
  // Derive position = target + distance * poseBasis · spherical(yaw, pitch).
  updatePosition(cam);
  return cam;
}
