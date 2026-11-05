import type { Channel } from '../Channel';
import type { Ease } from '../Ease';

/**
 * OscTrack — a zero-mean sine oscillation on a channel, active over a window.
 *
 * `amp` is the peak deviation from the base+vel value; `period` is the full
 * cycle length in seconds. The bob is active over `[startSec, endSec)` and the
 * sine phase is read off ABSOLUTE clip time (so the window only gates activity
 * and drives the fade — it never shifts the waveform). A PERPETUAL bob is the
 * limiting case `[-Infinity, +Infinity)`, which reduces exactly to the historical
 * `amp · sin(2π t / period)` for all t.
 *
 * `fade` is the amplitude ease-in/out ramp (seconds) at each end of the window:
 * the effective amplitude rises `0 → amp` over the first `fade` seconds, holds,
 * then falls `amp → 0` over the last `fade` seconds, shaped by `ease`. `fade === 0`
 * means no fade (full amplitude across the whole window). A perpetual bob always
 * has `fade === 0` — there is no finite window to fade against.
 *
 * Multiple `OscTrack`s on the same channel are summed (each bob is independent),
 * consistent with the additive layer model.
 */
export type OscTrack = {
  readonly channel: Channel;
  readonly amp: number;
  readonly period: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly fade: number;
  readonly ease: Ease;
};
