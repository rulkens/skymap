/**
 * DriverActivity — the per-frame facts a driver row's `isActive` reads beyond
 * the store, built once by `stepCameraRuntime` so every row sees the same bag.
 */

export type DriverActivity = {
  // The follow memory saturated last frame; only `followApproach` reads it.
  readonly approachDone: boolean;
  // The navigator's state after this frame's input; only the openspace rows read them.
  readonly navHeld: boolean;
  readonly navMoving: boolean;
};
