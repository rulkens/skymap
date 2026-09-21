import type { Channel } from '../Channel';
import type { Ease } from '../Ease';

/**
 * VelRamp — one velocity ramp window on a channel.
 *
 * A `rate` action ramps the channel's angular/linear velocity TO `to` over the
 * `[startSec, endSec)` window, then holds that velocity until the clip ends (or
 * another `VelRamp` on the same channel overrides it). The evaluator integrates
 * in closed form — no per-frame accumulator, so the result is frame-rate-
 * independent and scrubable.
 *
 * Multiple `VelRamp`s on the same channel are allowed (unlike `BaseSegment`
 * where overlaps are forbidden); a later ramp simply overrides the prior
 * velocity from its `startSec` onward.
 */
export type VelRamp = {
  readonly channel: Channel;
  readonly startSec: number;
  readonly endSec: number;
  readonly to: number;
  readonly ease: Ease;
};
