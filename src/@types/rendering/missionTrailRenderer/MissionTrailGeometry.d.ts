/**
 * MissionTrailGeometry — one craft's tessellated trail for upload: world-Mpc
 * positions in f64, three per vertex, in time order. The renderer splits them
 * into f32 hi/lo pairs itself, so the vertex layout has one owner.
 */

export type MissionTrailGeometry = {
  readonly id: string;
  readonly posMpc: Float64Array;
};
