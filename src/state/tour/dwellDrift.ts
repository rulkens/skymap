/**
 * dwellDrift — the canonical ambient dwell clip: a gentle orbit + bob sized to
 * `durationSec`. Beats author it directly (`dwellClip: dwellDrift(8)`); the
 * clip's compiled duration IS the beat's dwell length. It is one dwell clip
 * among any — a slow flyPath ring or a push-in are equally valid `dwellClip`s —
 * this is just the default idle motion.
 *
 * ### Two motions, two layers
 *
 * Yaw and pitch want different things, so they ride different effects:
 *
 *   - Yaw ORBITS: a single finite `spin` over the whole dwell with `ease: 'easeInOutCubic'`.
 *     The S-curve accelerates from rest, peaks mid-dwell, and decelerates back to
 *     rest right on the cut — every requirement (gentle start, ease-out before the
 *     next beat) in one node. It rotates BY a net angle and stays there, which is
 *     fine for an orbit; the next beat's fly resets the pose. (A LOOPING spin was
 *     the original mistake: its ease spread over the loop window, not the dwell,
 *     so a beat only ever saw the ramp-up.)
 *   - Pitch BOBS: an eased OSCILLATION — a zero-mean sine whose AMPLITUDE fades in
 *     and out over `rampSec`. Because it is zero-mean it returns to centre, so the
 *     camera nods without drifting off. (A spin or velocity ramp on pitch would
 *     tilt it to a new elevation; the amplitude-enveloped bob is what keeps it
 *     home.)
 *
 * Both run concurrently under `all`, both easing their motion in/out, so the
 * drift swells up and settles together.
 *
 * ### Sized once, at authoring time
 *
 * The ease-out lands exactly on the auto-advance cut for an uninterrupted dwell
 * (the timer runs for the same `durationSec`). After a pause/resume the saga
 * replays the clip from its start into the shorter remaining window, so the
 * motion gets cut mid-ease — see `pausableDwellSaga`'s header for why that
 * trade was accepted.
 *
 * `rampSec` (the pitch fade) and `cruiseRate` (the yaw's average orbit speed)
 * are NAMED options with defaults so the caller can tune the bob softness and
 * the orbit speed without editing this file — named, because as positional
 * args a beat once fed an orbit rate into the ramp slot and silently got the
 * default speed with a near-zero fade. The pitch fade is clamped to half the
 * window so a short dwell still fades symmetrically in and out.
 *
 * `spinTo` swaps the yaw layer for an unresolved `spinToId` — a bearing (a
 * sightline to a subject) rather than a raw radian delta pinned to one
 * orientation frame. It replaces `cruiseRate` rather than composing with it,
 * so the two together is an authoring error caught at clip-build time: same
 * "named knob, not a silent pick" stance as the ramp/cruise mixup above.
 *
 * ### Finite, and that's fine
 *
 * The clip ends (at `durationSec`) rather than looping forever. The dwell saga
 * FORKS it and cancels it when any race arm wins, so a finite clip that completes
 * at rest right as the timer fires is harmless: a completed fork is not a race
 * arm, and a cancel on an already-finished task is a no-op.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { FocusId } from '../../@types/animation/FocusId';
import { all, oscillate, spin, spinToId } from '../../services/engine/animation/effectHelpers';

// Yaw's average orbit speed (rad/s — 2π over 45s) and the pitch-bob fade length
// (s), both overridable. Pitch is a gentle bob: PITCH_AMP radians peak,
// PITCH_PERIOD the TARGET seconds per cycle (stretched to fit — see below).
const DEFAULT_CRUISE_RATE = (Math.PI * 2) / 45;
const DEFAULT_RAMP_SEC = 1.5;
const PITCH_AMP = 0.05;
const PITCH_PERIOD = 14;

export function dwellDrift(
  durationSec: number,
  opts?: { rampSec?: number; cruiseRate?: number; spinTo?: FocusId; turns?: number },
): ClipData {
  if (opts?.spinTo !== undefined && opts?.cruiseRate !== undefined) {
    throw new Error(
      'dwellDrift: spinTo and cruiseRate are mutually exclusive — spinTo replaces the yaw ' +
        'layer cruiseRate would have sized. Drop one.',
    );
  }
  const rampSec = opts?.rampSec ?? DEFAULT_RAMP_SEC;
  const cruiseRate = opts?.cruiseRate ?? DEFAULT_CRUISE_RATE;
  const fade = Math.min(rampSec, durationSec / 2);
  // Fit an INTEGER number of full cycles into the window, as close to the
  // target period as the duration allows. A free-running sine is mid-swing
  // wherever the window happens to end, so the amplitude fade drags the
  // camera back from that displacement — a visible vertical lurch right at
  // the cut. With whole cycles the sine returns to centre exactly at the
  // end, and the fade merely softens a settling the bob was doing anyway.
  const cycles = Math.max(1, Math.round(durationSec / PITCH_PERIOD));
  const period = durationSec / cycles;

  // Yaw: either a raw eased orbit (`by = cruiseRate × durationSec` makes the
  // AVERAGE angular speed `cruiseRate`) or, with `spinTo`, an unresolved
  // bearing-to-subject spin left for resolveClipFoci to size at play time.
  // Same ease and duration either way — only the source of `by` differs.
  const yaw =
    opts?.spinTo !== undefined
      ? spinToId(opts.spinTo, { over: durationSec, turns: opts.turns, ease: 'easeInOutCubic' })
      : spin('yaw', { by: cruiseRate * durationSec, over: durationSec, ease: 'easeInOutCubic' });

  return {
    start: 'live',
    timeline: [
      all([
        yaw,
        // Pitch: eased oscillation — a bob whose amplitude fades in/out over the
        // window, zero-mean and cycle-fitted so it returns to centre on the cut.
        oscillate('pitch', { amp: PITCH_AMP, period, over: durationSec, fade }),
      ]),
    ],
  };
}
