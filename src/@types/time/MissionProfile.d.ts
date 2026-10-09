/**
 * MissionProfile — the mission clock as a wall→sim table: at `wallMs[i]` after `startWallMs`
 * the sim clock reads `simDays[i]`. Both columns ascend, so `deriveSimDays` stays a pure
 * interpolation of wall time and a visitor's input only has to drop the table. `speedIndex`
 * is the `MISSION_SPEEDS` factor it was built at.
 */

export type MissionProfile = {
  readonly startWallMs: number;
  readonly wallMs: Float64Array;
  readonly simDays: Float64Array;
  readonly speedIndex: number;
};
