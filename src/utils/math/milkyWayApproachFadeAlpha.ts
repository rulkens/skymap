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
 * strength from a few tens of kpc out to ~10 Mpc, fading at both ends.
 *
 * The band is anchored to the disc's own scale (catalogue origin is the
 * Sun, so `camDistMpc` is the camera's distance from the Sun):
 *
 *   - 0.040 Mpc (~40 kpc) is just outside the ~25 kpc stellar-disc edge —
 *     far enough that you're still framing the galaxy from around it, so
 *     the impostor stays full strength (the 0.15 Mpc "home" framing sits
 *     comfortably beyond this).
 *   - 0.008 Mpc (~8 kpc) is the Sun's galactocentric radius — by the time
 *     the camera is this close it is deep inside the disc volume, so the
 *     impostor is fully gone and the solar-system descent is unobstructed.
 *
 * A smoothstep gives the same perceptually-soft ramp the far fade uses; a
 * hard cut would pop on a slow dive-in.
 *
 * Returns a number in `[0, 1]`:
 *   - `0.0` at distance ≤ 0.008 Mpc (camera deep inside — impostor hidden).
 *   - `1.0` at distance ≥ 0.040 Mpc (full impostor visibility).
 *   - Smoothstepped between.
 */

import { smoothstep } from './smoothstep';

const APPROACH_FADE_INNER_MPC = 0.008;
const APPROACH_FADE_OUTER_MPC = 0.04;

export function milkyWayApproachFadeAlpha(camDistMpc: number): number {
  return smoothstep(APPROACH_FADE_INNER_MPC, APPROACH_FADE_OUTER_MPC, camDistMpc);
}
