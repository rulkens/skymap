/**
 * MissionTrailBuilt — one craft's tessellated trail kept CPU-side: vertex times
 * (UT Julian date) for the per-frame `k` search, and the f64 world-Mpc positions
 * the head segment starts from.
 */

export type MissionTrailBuilt = {
  readonly tDays: Float64Array;
  readonly posMpc: Float64Array;
};
