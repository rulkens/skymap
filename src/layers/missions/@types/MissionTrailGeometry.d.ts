/**
 * MissionTrailGeometry — one craft's tessellated trail: vertex times (UT Julian
 * date, ascending) and world-Mpc positions in f64, three per vertex. The
 * renderer splits positions into f32 hi/lo pairs itself, so the vertex layout
 * has one owner, and keeps both arrays for the per-frame vertex count.
 */

export type MissionTrailGeometry = {
  readonly id: string;
  readonly tDays: Float64Array;
  readonly posMpc: Float64Array;
};
