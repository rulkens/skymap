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
 * ### Poses captured live
 *
 * The values below were captured by flying the running app to each regime,
 * never invented at a desk: the world-arm ones from the `l`-key `logState`
 * one-liner, the body-arm one by decoding a share link's `pose=` value. Every
 * capture except `milky-way-outside` and `milky-way-close` kept Earth as the
 * orbit target while dollying out, so those share the SAME look-at point
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

import { absoluteArm } from '../../src/utils/camera/absoluteArm';
import type { BodyId } from '../../src/@types/data/body/BodyId';
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

// The look-at point for `galactic-centre`: GALACTIC_CENTRE_ANCHOR.positionMpc,
// printed via tsx (not the hand-flown GALACTIC_CENTRE_TARGET above, which is
// ~178 pc off Sgr A* — ~550× the whole 0.325 pc S-star envelope, so reusing it
// would frame empty space at this scale).
const SGR_A_STAR_TARGET: Vec3 = [-0.0004469860712, -0.007138118108, -0.003965748015];

// `BodyId` is the settings-group union ('planet', 'earth', …), coarser than the
// scene body ids a body arm names, so the cast is the same one `decodeFramedPose`
// makes when it parses a `#pose=` body arm.
const MARS = 'mars' as BodyId;

export const PERF_SCENARIOS: readonly PerfScenario[] = [
  {
    name: 'earth-surface',
    pose: {
      framed: absoluteArm({
        target: EARTH_TARGET,
        distance: 8.9404154e-16,
        yaw: 1.3857,
        pitch: 0.7126,
      }),
    },
  },
  // 146 km over Jezero, inside Mars's atmosphere shell — the one scenario on
  // the body arm, and the only one that measures a non-Earth atmosphere. A
  // body-arm pose is body-local, so it frames the same ground whatever the sim
  // clock reads; only the lighting moves. Decoded from a share link's `pose=`
  // value (see the README), not from a logState dump. `clearFocus` because the
  // boot Earth focus sits outside Mars's subtree, and a body rung releases an
  // arm its focus does not reach — the vantage would snap back to Earth on the
  // first frame.
  {
    name: 'mars-jezero-146km',
    pose: {
      framed: {
        frame: { body: MARS },
        pose: {
          bodyId: MARS,
          anchorLocalM: [711639.0023079902, 3140420.910021869, 1073467.4616577267],
          eyeRelAnchorM: [22764.552087539458, 95693.15918994322, -107497.79259981122],
          basisLocal: [
            -0.9751969644374134, 0.22133881711211134, -0.00009269016082004422, 0.16705660047117435,
            0.7363094670430639, 0.655698452782812, -0.14519976856410274, -0.6394196562369432,
            0.7550228674859859,
          ],
        },
      },
      clearFocus: true,
    },
  },
  {
    name: 'solar-system',
    pose: {
      framed: absoluteArm({
        target: EARTH_TARGET,
        distance: 1.1343633e-10,
        yaw: 3.7281,
        pitch: 0.6638,
      }),
    },
  },
  {
    name: 'star-field',
    pose: {
      framed: absoluteArm({
        target: EARTH_TARGET,
        distance: 0.000089186628,
        yaw: 3.7281,
        pitch: 0.6638,
      }),
    },
  },
  {
    name: 'milky-way',
    pose: {
      framed: absoluteArm({
        target: EARTH_TARGET,
        distance: 0.011100341,
        yaw: 5.9423,
        pitch: 0.7802,
      }),
    },
  },
  // `clearFocus` on both galactic-centre-target poses: without it the boot
  // Earth focus pivot-pins the target back to Earth (~8 kpc off), so these
  // scenarios silently measured an Earth-centred framing until 2026-07-31.
  // Baselines before that date are not comparable for these two.
  {
    name: 'milky-way-outside',
    pose: {
      framed: absoluteArm({
        target: GALACTIC_CENTRE_TARGET,
        distance: 0.022368088,
        yaw: 4.4046,
        pitch: 0.4705,
      }),
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
      framed: absoluteArm({
        target: GALACTIC_CENTRE_TARGET,
        distance: 0.017838132,
        yaw: 4.4046,
        pitch: 0.4705,
      }),
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
      framed: absoluteArm({
        target: SGR_A_STAR_TARGET,
        distance: 5e-7,
        yaw: 4.4046,
        pitch: 0.4705,
      }),
      clearFocus: true,
    },
  },
  // Inside the Sgr A* lensing band (~96 AU, band alpha 1): the one regime
  // where the sky-cubemap capture + lens pass exist. galactic-centre above
  // sits at ~100k AU, far outside the band, and measures the zero-cost side.
  {
    name: 'sgr-a-star-lens',
    pose: {
      framed: absoluteArm({
        target: SGR_A_STAR_TARGET,
        distance: 4.666596145942944e-10,
        yaw: -1.1153012483898652,
        pitch: -0.2734819118684762,
      }),
      clearFocus: true,
    },
  },
  {
    name: 'local-group',
    pose: {
      framed: absoluteArm({
        target: EARTH_TARGET,
        distance: 21.268361,
        yaw: 8.2811,
        pitch: 0.5612,
      }),
    },
  },
  {
    name: 'full-survey',
    pose: {
      framed: absoluteArm({
        target: EARTH_TARGET,
        distance: 12372.364,
        yaw: 5.8964,
        pitch: 0.0552,
      }),
    },
  },
];
