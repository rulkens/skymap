/**
 * dwellDrift — the ambient camera motion played DURING a beat's dwell, shaped
 * as a velocity ENVELOPE synced to the time the dwell has left: ease the orbit
 * up to a cruise rate, hold, then ease back to rest, so the camera is still the
 * instant the next beat begins.
 *
 * ### Why an envelope, not a looping spin
 *
 * A looping `spin` orbits at one rate with no end. Easing its loop ramps over a
 * fixed window unrelated to the dwell, so within a single beat it either starts
 * abruptly or never settles before the cut. Expressing the motion on the
 * VELOCITY layer with `rate` makes "ease in, cruise, ease out" the literal
 * structure: each ramp carries the previous ramp's velocity, so `0 → ω → ω → 0`
 * reads straight down the timeline and integrates in closed form
 * (frame-rate-independent, scrubbable).
 *
 * ### Why a duration, not the beat
 *
 * The envelope needs exactly ONE number: how long it has to play. Taking the
 * REMAINING dwell seconds (not the whole `BeatData`) keeps the dependency
 * minimal and lands the ease-out on the cut even across pauses — `pausableDwellSaga`
 * restarts the drift on every resume with the time still left, so a freshly
 * reshaped envelope always fills exactly what remains.
 *
 * ### Finite, and that's fine
 *
 * The clip ends (at `durationSec`) rather than looping forever. The dwell saga
 * FORKS it and cancels it when any race arm wins, so a finite clip that
 * completes at rest right as the timer fires is harmless: a completed fork is
 * not a race arm, and a cancel on an already-finished task is a no-op.
 *
 * The ramp is clamped to half the window so a short remaining dwell still eases
 * symmetrically in and out and never overruns the cut.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import { fork, hold, oscillate, rate, seq } from '../../services/engine/animation/effectHelpers';

// Cruise angular velocity (rad/s) — the steady orbit speed once eased in — and
// the ease in/out ramp length (s). CRUISE_RATE is the old looping-spin rate
// (2π over 45s) so the cruise feel is unchanged; only the start/stop is new.
const CRUISE_RATE = (Math.PI * 2) / 45;
const RAMP_SEC = 1.5;

export function dwellDrift(durationSec: number): ClipData {
  const ramp = Math.min(RAMP_SEC, durationSec / 2);
  const cruise = Math.max(0, durationSec - 2 * ramp);
  return {
    start: 'live',
    timeline: [
      fork(oscillate('pitch', { amp: 0.04, period: 14 })), // gentle bob, under the envelope
      seq([
        rate('yaw', { to: CRUISE_RATE, over: ramp }), // ease in to cruise
        hold(cruise), // orbit at constant speed
        rate('yaw', { to: 0, over: ramp }), // ease out — at rest as the beat ends
      ]),
    ],
  };
}
