/**
 * earthFlyout — "Earth to the Edge": the powers-of-ten pull-back. Open with
 * Earth's globe filling the frame and dolly straight back to the observable
 * horizon (~29 500 Mpc) — the same shell `flyout` climbs to, but this one
 * departs from the ground rather than from wherever the user is framed.
 *
 * ### Why a builder over `simDays`, not a baked start pose
 *
 * `flyout` plays "from here", so it captures the live camera. This clip's whole
 * premise is a fixed origin — Earth — so it bakes a concrete `CameraPose` (the
 * bookmark-clip path documented on `ClipData.start`). But WHERE Earth is depends
 * on the clock: the shot must open on Earth as it sits when the clip PLAYS, not
 * at a fixed epoch. So `earthFlyout` is a function of `simDays` — the clip-start
 * instant — and reads Earth's position from the body-state snapshot at that
 * instant (`deriveBodyStates(simDays)`, the same source every render layer
 * reads). The clip player freezes the clock at clip start (02-core Task 13), so
 * the caller passes the frozen instant and the target lands where Earth is drawn.
 * `distance` is a few Earth-radii (km → Mpc via the one `SCALE_UNITS` table) and
 * yaw/pitch are eye-tuned opening angles — both epoch-independent, so they stay
 * module constants.
 *
 * ### One dolly, every scale — the fade bands do the rest
 *
 * The timeline is just `flyout`'s: a log-space `dollyTo` (perceptually uniform
 * across the ~20 decades from Earth's surface to the Hubble radius) with a
 * gentle yaw turn, both over the same window. There is deliberately NO
 * show/hide — `SCALE_FADE_BANDS` keys every layer's crossfade on the camera's
 * distance from the Sun and runs in BOTH directions, so climbing out dissolves
 * Earth → planets/glints → the local starfield → the Milky-Way impostor → the
 * surveys and cosmic web in order, for free. This clip is the landed descent
 * played in reverse.
 *
 * The orbit target stays locked on Earth for the whole pull: Earth sits ~1 AU
 * from the Sun, negligible at Mpc scale, so it shrinks to a dot dead-centre and
 * the Milky Way (drawn about the origin/Sun) frames up around it — the classic
 * Powers of Ten shot, with no target move to author.
 *
 * `FLIGHT_SEC` and the opening yaw/pitch are eye-tuning knobs — dialled in the
 * live loop via `?clip=earthFlyout`.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import { dollyTo, spin, all } from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../bodies/sceneEarth';
import { SCALE_UNITS } from '../../scaleUnits';

// The pull-back window. Longer than flyout's 22 s because this shot spans ~20
// scale-decades (Earth's surface → the horizon) rather than ~5; the extra time
// keeps the per-decade pace cinematic. Eye-tuned.
const FLIGHT_SEC = 70;

// Open with Earth's globe filling the frame: a few radii back from the surface.
// radiusKm → Mpc through the shared unit table so the authored number stays the
// one the seed recognises (Earth's 6371 km).
const EARTH_RADIUS_MPC = SCENE_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC;
const START_DISTANCE_MPC = EARTH_RADIUS_MPC * 3;

/**
 * Build the "Earth to the Edge" clip opening on Earth at `simDays`. `target`
 * comes from the body-state snapshot at that instant (which already composes the
 * render origin + the Keplerian offset propagated to `simDays`), copied into a
 * fresh tuple so the clip's start pose never aliases the memoized snapshot. The
 * caller passes the clip-start instant (the clip player freezes the clock there),
 * so the shot opens where Earth is drawn, not at a fixed epoch.
 */
export function earthFlyout(simDays: number): Clip {
  const earth = deriveBodyStates(simDays).get(SCENE_EARTH.id)!.positionMpc;
  const target: Vec3 = [earth[0], earth[1], earth[2]];
  return {
    id: 'earthFlyout',
    label: 'Earth to the Edge',
    data: {
      start: {
        target,
        distance: START_DISTANCE_MPC,
        // Authored in the ecliptic frame: pitch 0 puts the camera on the
        // ecliptic plane looking at Earth. These are frame-relative angles,
        // not a world-equatorial direction — the same literals read a
        // different world-space direction if the active frame changes.
        yaw: 0,
        pitch: 0,
      },
      timeline: [
        all([
          dollyTo(29_500, FLIGHT_SEC, 'easeInOutCubic'), // log-dolly Earth → Hubble radius
          spin('yaw', { by: 1.1, over: FLIGHT_SEC, ease: 'easeInOutCubic' }), // gentle turn, as flyout
        ]),
      ],
    },
  };
}
