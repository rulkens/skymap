/**
 * earthHomePose — the one canonical 'home' camera pose: Earth, framed to fill
 * the lens, viewed from its sunlit side with the terminator raking across the
 * globe. This is the pose the Home pill, the `h`/`e` keys, and cold boot all
 * converge on, so it lives in exactly one place.
 *
 * ### Why sun-side, and why the terminator offset
 *
 * The home shot is the payoff frame — the 'you are here' arrival. A generic
 * focus tween preserves the user's current yaw/pitch, so flying home can land on
 * Earth's NIGHT side: a black disc against black space, unreadable and flat.
 * Home is the one deliberate exception to that orientation-preserving rule. The
 * Sun sits at the render origin, so `earthPos` itself IS the sun→Earth direction
 * — the aim a camera looking at Earth's day side travels along. Aiming straight
 * down that axis, though, puts the Sun directly behind the camera and washes the
 * globe into a flat, shadowless full-phase disc. Rotating the aim a little about
 * world Y (`HOME_TERMINATOR_OFFSET_RAD`, eye-tuned over HMR) slides the eye off
 * the pure-sunward axis so the day/night boundary sweeps into view and gives the
 * sphere depth. The rotation is a plain 2D turn of the x/z components; it changes
 * only the aim's xz-azimuth, by exactly the offset.
 *
 * ### Why the distance is `bodyLikeFraming`'s, not a bespoke home distance
 *
 * This is forced by the follow mechanics, not taste. When home focus lands on
 * Earth the follow driver takes over, and `followElapsed` (`cameraClock.ts`)
 * nulls `followDistanceTarget` on every focus-row change; the driver then
 * re-seeds it to the body's framing distance (`bodyFocusDistance`, via
 * `bodyLikeFraming`). Any other landing distance would be glided away from the
 * instant the tween ends — a visible lurch. Ending the pose at the framing
 * distance makes the tween→follow handoff seamless: the follow driver captures a
 * pose already at rest. So the pose reuses `bodyLikeFraming`'s target + distance
 * verbatim (its `radius` field is a fly-past extent, irrelevant to a static
 * pose, and is dropped). The genuinely free tuning lever is the terminator
 * offset above.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Vec3 } from '../../../@types/math/Vec3';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { bodyLikeFraming } from './bodyLikeFraming';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';

/** Terminator swing off the pure-sunward aim, about world Y. Eye-tuned. */
export const HOME_TERMINATOR_OFFSET_RAD = (Math.PI / 180) * 25;

export function earthHomePose(simDays: number, fovYRad: number): CameraPose {
  const earthPos = deriveBodyStates(simDays).get('earth')!.positionMpc;
  const { target, distance } = bodyLikeFraming(earthPos, SCENE_EARTH.radiusKm, fovYRad);

  // `earthPos` is the sun→Earth (day-side) aim. Turn it about world Y by the
  // terminator offset, then let `orbitAnglesLookingAlong` read out the yaw/pitch
  // that looks along it — leaving the eye trailing on the sunlit side.
  const c = Math.cos(HOME_TERMINATOR_OFFSET_RAD);
  const s = Math.sin(HOME_TERMINATOR_OFFSET_RAD);
  const aim: Vec3 = [
    earthPos[0] * c + earthPos[2] * s,
    earthPos[1],
    -earthPos[0] * s + earthPos[2] * c,
  ];

  const { yaw, pitch } = orbitAnglesLookingAlong(aim);
  return { target, yaw, pitch, distance };
}
