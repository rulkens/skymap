/**
 * CameraSettings — the camera knobs the SettingsPanel owns, as against the
 * pose `src/state/camera/` drives.
 */
export type CameraSettings = {
  /** Vertical field of view in DEGREES; `runFrame` converts to radians once. */
  fovDeg: number;
};
