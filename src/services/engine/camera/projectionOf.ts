/**
 * projectionOf — extract the lens/frustum config from a live OrbitCamera as a
 * CameraProjection. The mirror of `poseOf`: where `poseOf` drops projection +
 * position and keeps the four orbit params, `projectionOf` keeps the four
 * projection numbers (fovYRad, aspect, near, far) and drops the rest.
 *
 * Completes the extract/merge set around the projection/pose split: `poseOf`
 * and `projectionOf` pull the two halves out of an OrbitCamera, and
 * `assembleOrbitCamera` merges them back. With both extractors present, the
 * bootstrap seed reads its projection straight off the camera instead of
 * re-spelling the four numbers from their source pieces (and re-deriving
 * `aspect` a second time).
 */

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';

export function projectionOf(cam: OrbitCamera): CameraProjection {
  return {
    fovYRad: cam.fovYRad,
    aspect: cam.aspect,
    near: cam.near,
    far: cam.far,
  };
}
