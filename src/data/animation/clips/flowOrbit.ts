/**
 * flowOrbit — a slow, seamless orbit `Clip` (id + label + serializable
 * `ClipData`) for viewing the CF4++ peculiar-velocity field with parallax.
 *
 * Derived from the `flowOrbitDriver` recording spike (`?floworbit`) — see
 * `docs/research/2026-06-19-camera-animation-spike-findings.md`.
 *
 * ### What it does
 *
 * Where `flyout` is a log-dolly (distance changes, orientation fixed), this is
 * the inverse — distance and target fixed, orientation sweeps — because the
 * flow field already supplies the motion; the camera's only job is to add
 * PARALLAX so the 3D structure of the streaming reads (the Laniakea "rotate the
 * velocity field" move).
 *
 *   - `start: 'live'` — the orbit sweeps relative to whatever framing the user
 *     has dialed in (aim at the flow basin, ~1000–1500 Mpc out, then play). Only
 *     yaw and pitch move; `target` and `distance` carry through from the live
 *     pose untouched.
 *
 *   - `spin('yaw', { by: 2π, over, ease: 'linear' })` — a CONSTANT-rate full
 *     revolution. Linear easing (not the default `inOut`) is deliberate: a
 *     constant angular velocity means the orientation at the end matches the
 *     start, so the recording loops with no visible seam. An eased spin would
 *     put a velocity discontinuity at the loop point.
 *
 *   - `fork(oscillate('pitch', { amp, period }))` — a gentle up/down "look
 *     around" riding a single sine period over the revolution, returning exactly
 *     to its start pitch so the bob loops cleanly too. Forked so it runs under
 *     the awaited spin rather than extending the clip.
 *
 * Unlike the spike (which ran indefinitely so an editor could pick the best
 * loop), this clip is one clean revolution; replay it for a longer orbit.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { spin, oscillate, fork } from '../../../services/engine/animation/effectHelpers';

/** Seconds per full 360° revolution. */
const PERIOD_SEC = 30;

/** Pitch bob amplitude, radians (~7°) — reveals depth without reading as a tumble. */
const PITCH_AMP_RAD = 0.12;

export const flowOrbit: Clip = {
  id: 'flowOrbit',
  label: 'Flow Orbit',
  data: {
    start: 'live',
    timeline: [
      fork(oscillate('pitch', { amp: PITCH_AMP_RAD, period: PERIOD_SEC })),
      spin('yaw', { by: Math.PI * 2, over: PERIOD_SEC, ease: 'linear' }),
    ],
  },
};
