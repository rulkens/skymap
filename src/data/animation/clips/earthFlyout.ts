/**
 * earthFlyout — "Earth to the Edge": the powers-of-ten pull-back. Open with
 * Earth's globe filling the frame and dolly straight back to the observable
 * horizon (~29 500 Mpc) — the same shell `flyout` climbs to, but this one
 * departs from the ground rather than from wherever the user is framed.
 *
 * ### Why a baked start pose, not `start: 'live'`
 *
 * `flyout` plays "from here", so it captures the live camera. This clip's whole
 * premise is a fixed origin — Earth — so it bakes a concrete `CameraPose` (the
 * bookmark-clip path documented on `ClipData.start`). The pose is DERIVED, never
 * hand-placed: `target` re-evaluates Earth's real J2000 position straight from
 * `ORBITAL_ELEMENTS` via `keplerianPositionMpc` + the render origin (data →
 * data, the same composition the body seed performs), and `distance` is a few
 * Earth-radii (converted km → Mpc through the one `SCALE_UNITS` table), so if
 * the heliocentric anchor or the elements ever move the shot follows them.
 * yaw/pitch are eye-tuned opening angles.
 *
 * The J2000 position is baked because the clip is authored data with no clock in
 * scope. 02-core Task 8b repoints `target` to the frozen-clock snapshot at clip
 * start — the shot must open where Earth IS when the clip plays, not where it
 * sat at J2000.
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
import { dollyTo, spin, all } from '../../../services/engine/animation/effectHelpers';
import { SCENE_EARTH } from '../../bodies/sceneEarth';
import { elementsById } from '../../bodies/orbitalElements';
import { RENDER_ORIGIN_MPC } from '../../renderOrigin';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../../utils/math/addVec3';
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

// Earth's real J2000 position, re-derived from the element table (data → data),
// value-identical to what the body seed bakes. 02-core Task 8b swaps this for
// the frozen-clock snapshot at clip start.
const EARTH_TARGET_MPC = addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(elementsById('earth')));

export const earthFlyout: Clip = {
  id: 'earthFlyout',
  label: 'Earth to the Edge',
  data: {
    start: {
      target: EARTH_TARGET_MPC,
      distance: START_DISTANCE_MPC,
      yaw: 0,
      pitch: 0,
    },
    timeline: [
      all([
        dollyTo(29_500, FLIGHT_SEC, 'inOut'), // log-dolly Earth → Hubble radius
        spin('yaw', { by: 1.1, over: FLIGHT_SEC, ease: 'inOut' }), // gentle turn, as flyout
      ]),
    ],
  },
};
