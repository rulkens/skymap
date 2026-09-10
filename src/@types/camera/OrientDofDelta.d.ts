/** One DOF's frame-to-frame motion with peak hold, radians. */
export type OrientDofDelta = {
  /** This frame − last frame, wrapped to ±π; 0 while the DOF is unresolved. */
  readonly deltaRad: number;
  /** Largest `|deltaRad|` since the last clear. */
  readonly peakAbsRad: number;
  /** `nowMs` of the frame that set `peakAbsRad`; null after a clear. */
  readonly peakAtMs: number | null;
};
