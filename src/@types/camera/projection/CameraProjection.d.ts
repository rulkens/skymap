/**
 * CameraProjection — the lens/canvas config that is NOT part of a CameraPose.
 *
 * A CameraPose carries only orbit parameters (target, yaw, pitch, distance).
 * CameraProjection holds the complementary Resource: the four numbers that
 * describe the frustum shape and the viewport ratio.  Together, pose + projection
 * form a complete OrbitCameraInit from which a live OrbitCamera can be assembled.
 *
 * Kept in its own one-type file because the engine clock task (and any future
 * code that stores projection separate from pose) imports it independently.
 */

export type CameraProjection = {
  fovYRad: number;
  aspect: number;
  near: number;
  far: number;
};
