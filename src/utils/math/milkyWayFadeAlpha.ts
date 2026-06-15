/**
 * milkyWayFade — distance-based alpha curve for the Milky Way impostor.
 *
 * The procedural impostor is a 2D ray-marched picture of "the galaxy
 * around you", parameterised for a viewer who is *inside* it.  Once the
 * camera flies more than a few Mpc from Earth, that framing is no longer
 * physically meaningful: from outside the Local Group, the Milky Way is
 * just a Sb-galaxy point in the SDSS catalog (which we don't render —
 * it's at the origin where there's no SDSS row to draw).  Letting the
 * impostor stay full-bright on a wide cosmic-web view would put a
 * cartoon spiral in the foreground of every shot.
 *
 * The band 10..50 Mpc is chosen as follows:
 *
 *   - 10 Mpc is well outside the Local Group (~3 Mpc) but inside the
 *     supergalactic plane out to Virgo.  At this distance the impostor
 *     is still the visually dominant element when the user looks
 *     "back at home", which is the experience we want.
 *   - 50 Mpc is roughly the distance at which 2MRS / GLADE galaxies
 *     start to dominate the field of view; past this point the user is
 *     scientifically interested in the catalog galaxies and the
 *     impostor would just be visual noise.
 *
 * A smoothstep gives a perceptually-soft fade — a hard cut would
 * pop visibly on a slow fly-out.  Sibling regime to `horizonShellFade`,
 * which fades in over the opposite (far) distance band; both share the
 * `smoothstep` primitive.
 *
 * Returns a number in `[0, 1]`:
 *   - `1.0` at distance ≤ 10 Mpc (full impostor visibility).
 *   - `0.0` at distance ≥ 50 Mpc.
 *   - Smoothstepped between.
 *
 * Negative input (defensive — should never happen with a real camera
 * distance which is `length(camPos) ≥ 0`) clamps to `1.0`.
 */

import { smoothstep } from './smoothstep';

const FADE_INNER_MPC = 10.0;
const FADE_OUTER_MPC = 50.0;

export function milkyWayFadeAlpha(camDistMpc: number): number {
  return 1 - smoothstep(FADE_INNER_MPC, FADE_OUTER_MPC, camDistMpc);
}
