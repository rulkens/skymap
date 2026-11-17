/** One orientation degree of freedom as the debug panel reads it, radians. */
export type CameraDofRow = {
  readonly currentRad: number | null;
  /** What the settle converges this DOF to, whether or not anything is applying it. */
  readonly targetRad: number | null;
  /** Wrapped `current − target`; null when either end is unresolved. */
  readonly residualRad: number | null;
};
