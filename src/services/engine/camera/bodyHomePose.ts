/**
 * bodyHomePose — the one canonical 'home' camera pose: the body, framed to fill
 * the lens, viewed from its sunlit side with the terminator raking across the
 * globe. This is the pose the Home pill, the `h`/`e` keys, and cold boot all
 * converge on, so it lives in exactly one place.
 *
 * ### Why sun-side, and why the terminator offset
 *
 * The home shot is the payoff frame — the 'you are here' arrival. A generic
 * focus tween preserves the user's current yaw/pitch, so flying home can land on
 * the body's NIGHT side: a black disc against black space, unreadable and flat.
 * Home is the one deliberate exception to that orientation-preserving rule. The
 * Sun sits at the render origin, so `bodyPos` itself IS the sun→body direction
 * — the aim a camera looking at the body's day side travels along. Aiming straight
 * down that axis, though, puts the Sun directly behind the camera and washes the
 * globe into a flat, shadowless full-phase disc. The pose instead aims along a
 * vector tilted `HOME_TERMINATOR_OFFSET_RAD` away from `s` (the sun→body unit
 * direction), swung toward `t`, a unit vector perpendicular to `s` and horizontal
 * in the equatorial frame (`t = normalize(cross(worldUp, s))`). Because `s` and
 * `t` are orthonormal, `aim = cos(offset)·s + sin(offset)·t` is itself unit
 * length and the angle between `aim` and `s` is exactly the offset — a true
 * Sun–body–camera phase angle, independent of the body's declination. That phase
 * angle is what actually controls the visible terminator: the shadowed fraction
 * of the disc is `(1 − cos(offset)) / 2`.
 *
 * ### Why the `frameBasis` argument
 *
 * The aim is a WORLD-space vector, but the returned yaw/pitch are read back by
 * the orbit camera's decode (`updatePosition`), which now runs through the
 * ACTIVE orientation basis (`ORIENTATION_FRAMES[settings.orientation]`, default
 * `ecliptic` — NOT identity). Encoding an angle pair is only the inverse of that
 * decode when both use the SAME basis: `orbitAnglesLookingAlong` rotates the aim
 * back through `frameBasisᵀ` before extracting the angles, exactly undoing the
 * decode's `frameBasis ·`. Omit the basis here and the ecliptic decode
 * reinterprets a legacy-identity encoding, swinging the eye off the sunlit axis —
 * boot first-paint and every home entry mis-aim. Callers thread the steady
 * committed basis so the round-trip is exact. Absent a basis the encode falls
 * back to identity (world-frame angles), matching an identity decode.
 *
 * ### Why the distance is `bodyLikeFraming`'s, not a bespoke home distance
 *
 * This is forced by the follow mechanics, not taste. When home focus lands on
 * a body the follow driver takes over, and `runFrame` drops the follow memory
 * on every focus-row change; the driver then
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
import type { Mat3 } from '../../../@types/math/Mat3';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { bodyLikeFraming } from './bodyLikeFraming';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';

/**
 * True Sun–body–camera phase angle between the aim and the pure-sunward axis.
 * Eye-tuned. The shadowed fraction of the disc is `(1 − cos(offset)) / 2`.
 */
export const HOME_TERMINATOR_OFFSET_RAD = (Math.PI / 180) * 60;

export function bodyHomePose(
  bodyId: string,
  simDays: number,
  fovYRad: number,
  frameBasis?: Mat3,
): CameraPose {
  const { radiusM } = findByIdOrThrow(SCENE_BODIES, bodyId, 'bodyHomePose');
  const state = deriveBodyStates(simDays).get(bodyId);
  if (!state) throw new Error(`bodyHomePose: no derived state for id '${bodyId}'`);
  const bodyPos = state.positionMpc;
  const { target, distance } = bodyLikeFraming(bodyPos, radiusM, fovYRad);

  // `s` is the sun→body (pure-sunward) unit direction; `t` is perpendicular to
  // it and horizontal in the equatorial frame (never degenerate — the body never
  // sits at the celestial pole). Swinging from `s` toward `t` by the terminator
  // offset gives an aim whose angle to `s` is exactly that offset, at any
  // declination — unlike a world-Y rotation, whose true angle to `s` shrinks as
  // the body's declination grows.
  const sMag = Math.hypot(bodyPos[0], bodyPos[1], bodyPos[2]);
  const sVec: Vec3 = [bodyPos[0] / sMag, bodyPos[1] / sMag, bodyPos[2] / sMag];
  // cross([0, 1, 0], sVec), which collapses to this closed form.
  const tRaw: Vec3 = [sVec[2], 0, -sVec[0]];
  const tMag = Math.hypot(tRaw[0], tRaw[1], tRaw[2]);
  const tVec: Vec3 = [tRaw[0] / tMag, tRaw[1] / tMag, tRaw[2] / tMag];

  const c = Math.cos(HOME_TERMINATOR_OFFSET_RAD);
  const s = Math.sin(HOME_TERMINATOR_OFFSET_RAD);
  const aim: Vec3 = [
    c * sVec[0] + s * tVec[0],
    c * sVec[1] + s * tVec[1],
    c * sVec[2] + s * tVec[2],
  ];

  // Encode the world-space aim through the SAME steady basis the decode reads,
  // so the returned yaw/pitch round-trip back to `aim` (see the frame section).
  const { yaw, pitch } = orbitAnglesLookingAlong(aim, frameBasis);
  return { target, yaw, pitch, distance };
}
