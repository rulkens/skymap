/**
 * DriverActivity — the per-frame facts a driver row's `isActive` reads beyond
 * the store, built once by `stepCameraRuntime` so every row sees the same bag.
 */

export type DriverActivity = {
  // The follow memory saturated last frame; only `followApproach` reads it.
  readonly approachDone: boolean;
};
