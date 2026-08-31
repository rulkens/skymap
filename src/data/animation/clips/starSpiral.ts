/**
 * starSpiral — "Into the Neighbourhood": open on Earth, then fly one continuous
 * outward spiral through the real stars of the solar neighbourhood, sweeping
 * within a fraction of a parsec of each so it reads as a bright sun swimming past
 * before the next rises ahead. The itinerary is baked offline
 * (`tools/animation/buildStarSpiral.ts` snaps the brightest real star in each
 * corridor of an ideal spiral onto `STAR_SPIRAL_WAYPOINTS`); this clip only has
 * to fly the frozen list.
 *
 * ### Why a builder over `simDays`, mirroring `earthFlyout`
 *
 * The shot opens on Earth, and WHERE Earth sits depends on the clock — so, like
 * `earthFlyout`, this is a function of the clip-start instant. The start pose
 * frames Earth's globe (a few radii back) from the body-state snapshot at that
 * instant (`deriveBodyStates(simDays)`, the same source every render layer
 * reads); the clip player freezes the clock at clip start and passes the frozen
 * instant, so the shot opens where Earth is drawn. Everything past the opening is
 * epoch-independent — the stars are fixed against the sky — so the waypoints are
 * baked and the tuning knobs are module constants.
 *
 * ### One flyPath, opening leg pinned — no separate pull-back
 *
 * The body is ONE `flyPath`. Its first spline knot is the live Earth eye (the
 * launch is a knot you don't author — see `docs/animation/clip-primitives.md`),
 * and `align` turns the camera into the path as it leaves the surface, so no
 * separate "pull back and turn" leg is needed. But the first leg spans ~20
 * distance-decades (Earth's surface out to the first star at a few parsecs),
 * which in the path's scale-space arc length would otherwise swallow most of the
 * budget. So the first leg's seconds are PINNED to `OPENING_LEG_SEC` — a brisk
 * powers-of-ten zoom out of the solar system — leaving the rest of `DURATION_SEC`
 * for the spiral itself, split across the star legs by arc length (uniform
 * perceived speed).
 *
 * ### Famous stars carry a deeper brake, not a focus
 *
 * A curated famous star gets a higher per-waypoint `linger` (`LINGER_FAMOUS`) so
 * the camera slows harder as it swims past — a longer look — while an anonymous
 * Gaia star gets the gentler `LINGER`. Both are the same `atPoint` pass; this
 * spike deliberately does NOT `atFocus` the famous ones (that would add a
 * catalog-readiness surface for no framing gain here), but the baked `famousId`
 * rides along on every waypoint so a later pass can upgrade to focus + caption
 * without re-deriving the match.
 *
 * The near-field Keplerian orbit trails (Earth/Jupiter/Moon rings) are hidden as
 * the flight begins — they read as clutter the instant the camera leaves the
 * planets behind.
 *
 * `PASS_DISTANCE_MPC`, `LOOK_AHEAD_SEC`, `LINGER`, `LINGER_FAMOUS`,
 * `DURATION_SEC` and `OPENING_LEG_SEC` are eye-tuning knobs — dialled in the
 * live loop via `?clip=starSpiral`.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { PathWaypoint } from '../../../@types/animation/PathWaypoint';
import { atPoint, flyPath, hide } from '../../../services/engine/animation/effectHelpers';
import { DEFAULT_TURN_DELAY } from '../../../services/engine/animation/pathDefaults';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../bodies/sceneEarth';
import { SCALE_UNITS } from '../../scaleUnits';
import { STAR_SPIRAL_WAYPOINTS } from './starSpiralWaypoints.generated';

// Open with Earth's globe filling the frame: a few radii back from the surface,
// radiusM → Mpc through the shared unit table (matches `earthFlyout`).
const EARTH_RADIUS_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
const START_DISTANCE_MPC = EARTH_RADIUS_MPC * 3;

// How close the camera passes each star, in Mpc (~103 AU). This is the camera's
// orbit distance at each star, and on the adaptive near-field slab (`slabs.ts`
// NEAR0) it sets the near clip plane to `distance · 1e-4` (`foregroundFrustum`).
// The old 2e-7 (~0.2 pc = 41,000 AU) put the near plane at ~4 AU, so a star's
// true-scale sphere (`fieldStarSphereLayer`, one solar radius) clipped away once
// the eye closed inside ~4 AU — it never grew past ~2 px and read as a dot (the
// user's complaint, measured). At 5e-10 the near plane is ~0.01 AU (≈2 solar
// radii), so the sphere fills the frame (~36° / ~580 px at a 1080-px viewport)
// at closest approach before the eye punches through — a bright sun swimming
// past. The angle channels (yaw/pitch) are distance-independent, so this does
// NOT change the path's turn-rate jank: closer framing is free on that axis
// (measured — whiplash was identical from 2e-7 down to 1e-10). Dial toward 1e-10
// (~21 AU, sun overfills) for a surface skim or 1e-9 (~206 AU, ~21°) for calmer.
const PASS_DISTANCE_MPC = 5e-10;

// Seconds the look leads the eye down the path (the causal-Hermite `lookAhead`).
// The itinerary snaps 233 real stars at arc-length-uniform spacing (~20 pc
// cadence), tightening toward a 4.66 pc minimum leg near the inner turn (10 pc
// from Earth), where curvature peaks at a 95th-percentile ~4.5 deg/pc. At the
// default lead (1.3 s) the aim snaps hard through that tight inner turn. A
// longer lead averages the aim over more of the path, so it tracks the
// smoothed direction of travel rather than snapping between crowded knots,
// with eye speed left smooth (it is arc-length paced). The rest of the spline
// config (basis, turn delay) stays the tuned default. Raise toward 10 for even
// smoother aim, lower toward the 1.3 default for a more reactive one.
const LOOK_AHEAD_SEC = 7;

// Per-waypoint brake ∈ [0,1]: the local slow-down as the camera passes a star.
// Anonymous Gaia stars get the gentler dip; curated famous stars brake harder
// for a longer look.
const LINGER = 0.35;
const LINGER_FAMOUS = 0.7;

// Total cruise seconds for the spiral. Dwell (the per-waypoint lingers) adds
// wall-clock time on top of this — the flown clip runs a little longer.
const DURATION_SEC = 720;

// Seconds pinned to the first leg — the powers-of-ten zoom from Earth's surface
// out to the first star. Pinned so the ~20-decade opening leg does not eat the
// spiral's budget via its outsized scale-space arc length.
const OPENING_LEG_SEC = 12;

export { DURATION_SEC };

/**
 * Build the "Into the Neighbourhood" clip opening on Earth at `simDays`. `target`
 * comes from the body-state snapshot at that instant, copied into a fresh tuple
 * so the start pose never aliases the memoized snapshot.
 */
export function starSpiral(simDays: number): Clip {
  const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
  const target: Vec3 = [earth[0], earth[1], earth[2]];

  const waypoints: PathWaypoint[] = STAR_SPIRAL_WAYPOINTS.map((w, i) => {
    const at: Vec3 = [w.at[0], w.at[1], w.at[2]];
    const linger = w.famousId !== undefined ? LINGER_FAMOUS : LINGER;
    return atPoint(at, PASS_DISTANCE_MPC, {
      linger,
      ...(i === 0 ? { over: OPENING_LEG_SEC } : {}),
    });
  });

  return {
    id: 'starSpiral',
    label: 'Into the Neighbourhood',
    data: {
      start: {
        target,
        distance: START_DISTANCE_MPC,
        yaw: 0,
        pitch: 0,
      },
      timeline: [
        hide(['orbitTrails'], 1),
        flyPath(waypoints, {
          over: DURATION_SEC,
          // Longer look-ahead than the authored default to tame the aim whiplash
          // through the tightly-curved inner turn of the star knots (see
          // `LOOK_AHEAD_SEC`); basis + turn-delay stay the tuned default
          // (`DEFAULT_SPLINE_CONFIG` is the same causal-Hermite basis).
          spline: { kind: 'causalHermite', turnDelay: DEFAULT_TURN_DELAY, lookAhead: LOOK_AHEAD_SEC },
        }),
      ],
    },
  };
}
