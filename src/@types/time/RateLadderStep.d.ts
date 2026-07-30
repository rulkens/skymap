/**
 * RateLadderStep — one detented playback speed on the sim clock's rate ladder.
 *
 * The clock does not expose a continuous rate slider; it steps through a fixed
 * `RATE_LADDER` of human-legible speeds ('1 min/s', '1 day/s', …). Each step
 * pairs the display `label` with `simSecPerRealSec` — how many seconds of sim
 * time pass per real second at that detent. Sign (forward/reverse) lives on
 * `TimeState.direction`, not here; pause lives on `TimeState.paused`, not here —
 * so every ladder entry is a strictly positive magnitude.
 */

export type RateLadderStep = {
  /** Human-legible detent name, e.g. '1 day/s'. */
  readonly label: string;
  /** Sim seconds elapsed per real second at this detent, e.g. 86_400. */
  readonly simSecPerRealSec: number;
};
