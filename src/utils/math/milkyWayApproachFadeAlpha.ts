/**
 * milkyWayApproachFadeAlpha — near-side fade for the Milky Way impostor.
 *
 * The procedural impostor is a billboard painting of "the galaxy around
 * you", calibrated to be viewed from outside the disc looking in.  Once
 * the camera dives *inside* the disc — heading down toward the Sun and the
 * solar system — that framing breaks down: a flat cartoon spiral would
 * hang in front of the solar-system view like a billboard you've walked
 * behind.  So the impostor fades out as you approach, the same way a
 * cluster's overlay dims once you're inside its radius.
 *
 * This is the near-side companion to `milkyWayFadeAlpha`, which fades the
 * impostor on the FAR side (≥10 Mpc, flying out to the cosmic web).
 * Together they bound the band where the impostor reads as "home": full
 * strength from deep inside the disc out to ~10 Mpc, fading at both ends.
 *
 * The band is anchored to the disc's own scale (catalogue origin is the
 * Sun, so `camDistMpc` is the camera's distance from the Sun). The whole
 * dive from tens of kpc down toward the Sun should keep the impostor on
 * screen — it only has to yield once the camera is essentially *at* the
 * Sun's own galactocentric radius, deep inside the disc, where a flat
 * spiral painting would hang in front of the solar-system view. So the
 * band closes only in that last stretch, near and inside ~8 kpc:
 *
 *   - 0.008 Mpc (~8 kpc) is the Sun's galactocentric radius — the outer
 *     edge of the fade. Anywhere farther out (the entire descent through
 *     the disc, and the 0.15 Mpc "home" framing well beyond it) the
 *     impostor holds full strength.
 *   - 0.002 Mpc (~2 kpc) is well inside the Sun's orbit, in among the
 *     inner disc / bulge — the inner edge. By the time the camera is this
 *     close to the galactic centre the impostor is fully gone and the
 *     solar-system descent is unobstructed.
 *
 * A smoothstep gives the same perceptually-soft ramp the far fade uses; a
 * hard cut would pop on a slow dive-in.
 *
 * Returns a number in `[0, 1]`:
 *   - `0.0` at distance ≤ 0.002 Mpc (camera deep inside — impostor hidden).
 *   - `1.0` at distance ≥ 0.008 Mpc (full impostor visibility).
 *   - Smoothstepped between.
 */

import { smoothstep } from './smoothstep';

const APPROACH_FADE_INNER_MPC = 0.002;
const APPROACH_FADE_OUTER_MPC = 0.008;

export function milkyWayApproachFadeAlpha(camDistMpc: number): number {
  return smoothstep(APPROACH_FADE_INNER_MPC, APPROACH_FADE_OUTER_MPC, camDistMpc);
}
