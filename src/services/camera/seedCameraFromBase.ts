/**
 * seedCameraFromBase — copy an orbit pose into the live drag register.
 *
 * The live `OrbitCamera` (`state.cam`) is the drag register: `orbitControls`
 * reads its fields while the user holds a pointer and mutates them on every
 * pointermove. Between gestures `state.cam` is stale — the produce step
 * derives the rendered pose from the Redux store, not from `state.cam`. Before
 * beginning a new gesture the register must be seeded from the last LIVE
 * produced pose so the drag continues from exactly where the animation left
 * the camera, rather than from whatever state the register holds from the
 * previous gesture.
 *
 * The parameter is named `pose` rather than `base` because the caller passes
 * `state.cameraRuntime.lastPose.current` — the live produced pose — NOT
 * `store.getState().camera.base`. At rest `lastPose == base`; mid-tween
 * `lastPose` is the animation's current interpolated position while `base` is
 * still the pre-tween committed value. Seeding from `lastPose` makes both the
 * at-rest grab and the mid-animation grab jump-free. The name `seedCameraFromBase`
 * matches the plan's naming contract and documents the domain purpose; callers
 * document the live-pose source in their own comments.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { CameraPose } from '../../@types/camera/CameraPose';
import { updatePosition } from '../../utils/camera/updatePosition';

/**
 * Copy the orbit parameters (including `roll`) from `pose` onto the live drag
 * register `cam` and recompute `cam.position` so the first drag delta is
 * relative to exactly where the animation left the camera.
 *
 * `cam.fovYRad`, `cam.aspect`, `cam.near`, and `cam.far` are NOT touched —
 * those come from the projection Resource (`state.cameraRuntime.projection`)
 * and are merged in by `assembleOrbitCamera` on each produced frame. The drag
 * register only needs the orbit parameters to feed `orbitControls` math.
 */
export function seedCameraFromBase(cam: OrbitCamera, pose: CameraPose): void {
  // Copy target element-by-element; never alias the pose's array, since the
  // register mutates target in place during pans.
  cam.target[0] = pose.target[0];
  cam.target[1] = pose.target[1];
  cam.target[2] = pose.target[2];
  cam.yaw = pose.yaw;
  cam.pitch = pose.pitch;
  cam.distance = pose.distance;
  cam.roll = pose.roll;
  // Recompute the world-space position from the updated orbit params so the
  // first pointermove delta is computed from the correct starting position.
  updatePosition(cam);
}
