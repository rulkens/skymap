/**
 * perseveranceToSondermarken — from the rover's shoulder at Jezero out to the
 * inner solar system, where Earth's and Mars's orbits read as ellipses, and
 * back down onto Søndermarken, landing on `sondermarkenFlyout`'s opening pose.
 *
 * Each leg is ONE log dolly, so nothing stops between the holds; the target
 * and the aim move inside it. The target crosses the AU gap only in the
 * dolly's widest quarter, so the planet left behind stays in frame, and every aim
 * change that is not a pure tilt about the ground point runs above ~100 planet
 * radii, where no sightline can dip the eye under a surface.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  aimAt,
  all,
  dollyTo,
  hold,
  moveTarget,
  seq,
  tween,
  wait,
} from '../../../services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { linkedPoseToWorld } from '../../../utils/camera/linkedPoseToWorld';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { frameUp } from '../../../utils/camera/frameUp';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { normalize3 } from '../../../utils/math/normalize3';
import { northUpRoll } from '../../../utils/camera/northUpRoll';
import { ORIENTATION_FRAMES } from '../../orientation/orientationFrames';
import { SCALE_UNITS } from '../../scaleUnits';
import { SONDERMARKEN_POSE } from './sondermarkenFlyout';

/** The opening view, as the app's `#pose=` link value: 8.6 m off the rover. */
export const PERSEVERANCE_POSE =
  's,perseverance,0.48274334808813857,0.15066116048769496,8.617544429797482';

// Eye-tuned. Each leg spans 9-11 decades of distance.
const LEAD_IN_SEC = 3;
const LEG_SEC = 45;
const SYSTEM_HOLD_SEC = 4;
// Sub-windows, in seconds of a leg.
const TARGET_SEC = 12; // the AU crossing: the outbound leg's last 12 s, the inbound's first
const TILT_SEC = 14; // look down on the rover / tilt up to the park, both below ~10 km
const SWING_SEC = 12; // outbound: overhead → system view, past ~100 Mars radii
const DESCEND_AIM_SEC = 16; // inbound: system view → overhead Søndermarken

// Mars aphelion is ~1.67 AU: 4.5 AU back keeps it well inside the 30° half-FOV.
const SYSTEM_DISTANCE_MPC = 4.5 * SCALE_UNITS.AU_TO_MPC;
const SYSTEM_ELEVATION_RAD = (40 * Math.PI) / 180;

const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const neg = (v: Readonly<Vec3>): Vec3 => [-v[0], -v[1], -v[2]];

/** Built at the frozen clip-start instant: both ends are surface poses that turn with their planet. */
export function perseveranceToSondermarken(simDays: number): Clip {
  const basis = ORIENTATION_FRAMES.ecliptic;
  const linked = linkedPoseToWorld(PERSEVERANCE_POSE, simDays, basis);
  const end = linkedPoseToWorld(SONDERMARKEN_POSE, simDays, basis);
  const bodies = deriveBodyStates(simDays);
  const rover = bodies.get('perseverance')!.positionMpc;
  const roverUp = normalize3(sub(rover, bodies.get('mars')!.positionMpc));
  // The world arm pivots where the sightline meets Mars's DATUM, kilometres
  // past the rover (Jezero lies below it); pivot on the rover instead, same
  // eye and sightline, so the pull-out and the tilt turn about what is framed.
  const eye = eyeMpcOf(linked, basis);
  const range = Math.hypot(...sub(eye, rover));
  const toEye = normalize3(sub(eye, linked.target));
  const target: Vec3 = [
    eye[0] - range * toEye[0],
    eye[1] - range * toEye[1],
    eye[2] - range * toEye[2],
  ];
  const parkUp = normalize3(sub(end.target, bodies.get('earth')!.positionMpc));

  // The system view looks down on the Sun from the rover's side of the sky,
  // so the outbound swing is mostly a change of tilt.
  const pole = frameUp(basis);
  const k = roverUp[0] * pole[0] + roverUp[1] * pole[1] + roverUp[2] * pole[2];
  const across = normalize3([
    roverUp[0] - k * pole[0],
    roverUp[1] - k * pole[1],
    roverUp[2] - k * pole[2],
  ]);
  const [c, s] = [Math.cos(SYSTEM_ELEVATION_RAD), Math.sin(SYSTEM_ELEVATION_RAD)];
  const systemAim = neg([
    c * across[0] + s * pole[0],
    c * across[1] + s * pole[1],
    c * across[2] + s * pole[2],
  ]);

  const outbound = all([
    dollyTo(SYSTEM_DISTANCE_MPC, LEG_SEC),
    seq([wait(LEG_SEC - TARGET_SEC), moveTarget([0, 0, 0], TARGET_SEC)]),
    seq([
      aimAt(orbitAnglesLookingAlong(neg(roverUp), basis), TILT_SEC),
      wait(LEG_SEC - TILT_SEC - SWING_SEC),
      all([
        aimAt(orbitAnglesLookingAlong(systemAim, basis), SWING_SEC),
        // Roll 0 levels the ecliptic across the frame.
        tween('roll', { to: 0, over: SWING_SEC }),
      ]),
    ]),
  ]);
  const inbound = all([
    dollyTo(end.distance, LEG_SEC),
    moveTarget(end.target, TARGET_SEC),
    seq([
      all([
        aimAt(orbitAnglesLookingAlong(neg(parkUp), basis), DESCEND_AIM_SEC),
        // Overhead the park, north at the top, as sondermarkenFlyout frames it.
        tween('roll', {
          to: northUpRoll(neg(parkUp), bodies.get('earth')!.orientation, basis),
          over: DESCEND_AIM_SEC,
        }),
      ]),
      wait(LEG_SEC - DESCEND_AIM_SEC - TILT_SEC),
      all([
        aimAt({ yaw: end.yaw, pitch: end.pitch }, TILT_SEC),
        tween('roll', { to: end.roll ?? 0, over: TILT_SEC }),
      ]),
    ]),
  ]);

  return {
    id: 'perseveranceToSondermarken',
    label: 'Perseverance to Søndermarken',
    data: {
      start: { target, distance: range, yaw: linked.yaw, pitch: linked.pitch, roll: linked.roll },
      timeline: [seq([wait(LEAD_IN_SEC), outbound, hold(SYSTEM_HOLD_SEC), inbound])],
    },
  };
}
