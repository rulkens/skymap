/**
 * dwellDrift — the ambient camera motion played DURING a beat's dwell, shaped
 * as a velocity ENVELOPE synced to the time the dwell has left: ease the orbit
 * up to a cruise rate, hold, then ease back to rest, so the camera is still the
 * instant the next beat begins.
 *
 * ### Both axes, the same envelope
 *
 * Yaw orbits and pitch tilts, but they ramp identically: each is a velocity
 * envelope on its channel — `rate` up to a cruise speed, `hold` at that speed,
 * `rate` back to zero — run concurrently under `all`. Expressing the motion on
 * the VELOCITY layer is what makes "ease in, cruise, ease out" the literal
 * structure: each ramp carries the previous ramp's velocity, so `0 → ω → ω → 0`
 * reads straight down the timeline and integrates in closed form
 * (frame-rate-independent, scrubbable). Pitch cruises at a gentle fraction of
 * yaw so the tilt stays a subtle wobble under the orbit.
 *
 * ### Why a duration, not the beat
 *
 * The envelope needs exactly one thing from the dwell: how long it has to play.
 * Taking the REMAINING dwell seconds (not the whole `BeatData`) keeps the
 * dependency minimal and lands the ease-out on the cut even across pauses —
 * `pausableDwellSaga` restarts the drift on every resume with the time still
 * left, so a freshly reshaped envelope always fills exactly what remains.
 *
 * `rampSec` and `cruiseRate` are arguments (with defaults) so the caller can
 * tune the start/stop softness and the orbit speed without editing this file.
 * The ramp is clamped to half the window, so a short remaining dwell still eases
 * symmetrically in and out and never overruns the cut.
 *
 * ### Finite, and that's fine
 *
 * The clip ends (at `durationSec`) rather than looping forever. The dwell saga
 * FORKS it and cancels it when any race arm wins, so a finite clip that
 * completes at rest right as the timer fires is harmless: a completed fork is
 * not a race arm, and a cancel on an already-finished task is a no-op.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { Channel } from '../../@types/animation/Channel';
import { all, hold, rate, seq } from '../../services/engine/animation/effectHelpers';

// Defaults: the steady orbit speed once eased in (rad/s — 2π over 45s, the old
// looping-spin rate, so the cruise feel is unchanged), and the ease in/out ramp
// length (s). Pitch cruises at this fraction of yaw, a gentle wobble.
const DEFAULT_CRUISE_RATE = (Math.PI * 2) / 45;
const DEFAULT_RAMP_SEC = 1.5;
const PITCH_FRACTION = 0.1;

export function dwellDrift(
  durationSec: number,
  rampSec: number = DEFAULT_RAMP_SEC,
  cruiseRate: number = DEFAULT_CRUISE_RATE,
): ClipData {
  const ramp = Math.min(rampSec, durationSec / 2);
  const cruise = Math.max(0, durationSec - 2 * ramp);

  // One eased velocity envelope: rest → cruiseV → rest, over the whole window.
  const envelope = (ch: Channel, cruiseV: number) =>
    seq([
      rate(ch, { to: cruiseV, over: ramp }), // ease in to cruise
      hold(cruise), // hold at constant speed
      rate(ch, { to: 0, over: ramp }), // ease out — at rest as the beat ends
    ]);

  return {
    start: 'live',
    timeline: [all([envelope('yaw', cruiseRate), envelope('pitch', cruiseRate * PITCH_FRACTION)])],
  };
}
