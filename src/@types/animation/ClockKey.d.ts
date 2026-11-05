/**
 * ClockKey — one row of a clip `clock` cue: `sec` seconds after the cue fires, the
 * sim clock reads `simDays` (a Julian day). Linear between rows.
 */
export type ClockKey = {
  readonly sec: number;
  readonly simDays: number;
};
