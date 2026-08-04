/**
 * perfScenarios — the named camera vantages the perf harness benchmarks.
 *
 * Each scenario is a regime of the powers-of-ten descent whose frame cost we
 * want to characterise independently: standing on Earth's surface, out among
 * the planets, in the parsec-scale star field, at Milky-Way galaxy scale —
 * from inside the disc, from outside looking back at it where the galaxy
 * fills the frame, and dollied in close enough that the disc overflows the
 * viewport — in the Local Group, and zoomed out to the full survey. Frame
 * cost is a function of WHERE the camera is (how much geometry projects, how
 * much fill each pass touches), so a fixed pose per regime is what makes a
 * run reproducible.
 *
 * ### Poses captured live via logState
 *
 * The `pose` values below were captured by flying the running app to each
 * regime and reading the `l`-key `logState` one-liner — physical coordinates
 * invented at a desk would put the camera nowhere meaningful. Every capture
 * except `milky-way-outside` and `milky-way-close` kept Earth as the orbit
 * target while dollying out, so those share the SAME look-at point
 * (`EARTH_TARGET` — Earth's J2000 heliocentric position, ~1 AU off the
 * origin) and differ only in `distance` plus a little yaw/pitch framing: from
 * Earth's surface (`8.9e-16` Mpc) out to the full survey (`12372` Mpc), the
 * ~30 scale-decades of the powers-of-ten descent. From `milky-way` outward
 * the camera is so far back that Earth's 1 AU offset from the Sun is far
 * below one pixel, so the shared Earth target is indistinguishable from the
 * origin there. `milky-way-outside` and `milky-way-close` target the
 * galactic centre instead (`GALACTIC_CENTRE_TARGET`, ~8 kpc off the origin,
 * not ~1 AU): the outside pose sits ~22 kpc outside the disc looking back at
 * it, so the galaxy fills the frame — the `milky-way` pose, sitting inside
 * the disc looking at Earth, never exercises that fill cost. The close pose
 * dollies the same look-at in to ~17.8 kpc, crossing from outside the disc to
 * inside it (see the comment on `milky-way-close` below for why that is a
 * distinct cost regime, not just a bigger version of `milky-way-outside`).
 * `fovYRad` from the dump is the 60° default and not part of `PerfPose`,
 * dropped.
 */

import type { PerfPose } from '../../src/@types/perf/PerfPose';
import type { Vec3 } from '../../src/@types/math/Vec3';

export type PerfScenario = { readonly name: string; readonly pose: PerfPose };

// The shared look-at point for every scenario but `milky-way-outside` and
// `milky-way-close`: Earth (its J2000 heliocentric position, matching
// `deriveBodyStates(CONST_J2000).get('earth')` — verified equal at capture
// time).
// Factored out so those poses differ only in the axes that actually vary
// (distance/yaw/pitch) and the target can never drift between them.
const EARTH_TARGET: Vec3 = [-8.5895045e-13, 4.3022234e-12, 1.865304e-12];

// The shared look-at point for `milky-way-outside` and `milky-way-close`: the
// galactic centre (~8 kpc off the origin — contrast `EARTH_TARGET`'s ~1 AU).
// Same reasoning as `EARTH_TARGET`: two poses target it, so it is factored out
// once rather than risking the target drifting between them.
const GALACTIC_CENTRE_TARGET: Vec3 = [-0.00043726202, -0.0069827522, -0.0038794295];

// The look-at point for `galactic-centre`: SGR_A_STAR_ANCHOR.positionMpc,
// printed via tsx (not the hand-flown GALACTIC_CENTRE_TARGET above, which is
// ~178 pc off Sgr A* — ~550× the whole 0.325 pc S-star envelope, so reusing it
// would frame empty space at this scale).
const SGR_A_STAR_TARGET: Vec3 = [-0.0004469860712, -0.007138118108, -0.003965748015];

export const PERF_SCENARIOS: readonly PerfScenario[] = [
  {
    name: 'earth-surface',
    pose: { target: EARTH_TARGET, distance: 8.9404154e-16, yaw: 1.3857, pitch: 0.7126 },
  },
  {
    name: 'solar-system',
    pose: { target: EARTH_TARGET, distance: 1.1343633e-10, yaw: 3.7281, pitch: 0.6638 },
  },
  {
    name: 'star-field',
    pose: { target: EARTH_TARGET, distance: 0.000089186628, yaw: 3.7281, pitch: 0.6638 },
  },
  {
    name: 'milky-way',
    pose: { target: EARTH_TARGET, distance: 0.011100341, yaw: 5.9423, pitch: 0.7802 },
  },
  // `clearFocus` on both galactic-centre-target poses: without it the boot
  // Earth focus pivot-pins the target back to Earth (~8 kpc off), so these
  // scenarios silently measured an Earth-centred framing until 2026-07-31.
  // Baselines before that date are not comparable for these two.
  {
    name: 'milky-way-outside',
    pose: {
      target: GALACTIC_CENTRE_TARGET,
      distance: 0.022368088,
      yaw: 4.4046,
      pitch: 0.4705,
      clearFocus: true,
    },
  },
  // Same look-at, yaw and pitch as `milky-way-outside`, dollied in from ~22
  // kpc to ~17.8 kpc — crossing from outside the disc to inside it. That is a
  // different cost regime for the star pass, not a bigger version of the same
  // one. From outside, every sprite is pinned at the `starPxMin` floor, so
  // fill is `count × π × pxMin²` — flat across the field. Close in, near
  // sprites blow past the `starPxMax` cap instead: a capped sprite is 48
  // target px, ~7,240 texels, so a few dozen of them is a full screen of
  // additive overdraw. That is where the frame rate actually collapses, and
  // `milky-way-outside` never exercises it.
  {
    name: 'milky-way-close',
    pose: {
      target: GALACTIC_CENTRE_TARGET,
      distance: 0.017838132,
      yaw: 4.4046,
      pitch: 0.4705,
      clearFocus: true,
    },
  },
  // Inside the S-star cluster: at 5e-7 Mpc every one of the 39 S-star orbits
  // clears the orbit-trails CULL_PX gate (all pass below 6.66e-7 Mpc at this
  // viewport), so this pose is the max-instance-count regime for the
  // ribbon-impostor trail renderer. `clearFocus` because the boot Earth
  // focus would otherwise pivot-pin the target back to Earth.
  {
    name: 'galactic-centre',
    pose: {
      target: SGR_A_STAR_TARGET,
      distance: 5e-7,
      yaw: 4.4046,
      pitch: 0.4705,
      clearFocus: true,
    },
  },
  {
    name: 'local-group',
    pose: { target: EARTH_TARGET, distance: 21.268361, yaw: 8.2811, pitch: 0.5612 },
  },
  {
    name: 'full-survey',
    pose: { target: EARTH_TARGET, distance: 12372.364, yaw: 5.8964, pitch: 0.0552 },
  },
];
