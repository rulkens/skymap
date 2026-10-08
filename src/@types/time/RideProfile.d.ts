/**
 * RideProfile — a flyby ride's clock as a wall→sim table: at `wallMs[i]` after `startWallMs`
 * the sim clock reads `simDays[i]`. Both columns ascend, so `deriveSimDays` stays a pure
 * interpolation of wall time and a visitor's input only has to drop the table.
 */

export type RideProfile = {
  readonly startWallMs: number;
  readonly wallMs: Float64Array;
  readonly simDays: Float64Array;
};
