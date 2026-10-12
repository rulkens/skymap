/**
 * homePose — the committed pose of a composition's home: its body's home
 * framing at `simDays`, or the neutral pose for a home-less composition.
 * `frameBasis` is the committed orientation basis the angles encode through.
 */

import { bodyHomePose } from './bodyHomePose';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { GALACTIC_DISC_FORWARD, INITIAL_DISTANCE_MPC } from './cameraFraming';
import type { EngineHomeConfig } from '../../../@types/engine/EngineHomeConfig';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';

export function homePose(
  home: EngineHomeConfig,
  fovYRad: number,
  simDays: number,
  frameBasis: Mat3,
): FramedCameraPose {
  // The home distance is `bodyLikeFraming`'s deliberately UNCLAMPED body-scale
  // value — no `clampDistance` here: it takes a pivot radius the boot pose
  // hasn't resolved yet, and the absolute floor alone would swallow the framing
  // at ~2e-16 Mpc. The wheel-zoom clamps own the floor; see `bodyLikeFraming`.
  const pose =
    home.focus === null
      ? {
          target: [0, 0, 0] as Vec3,
          distance: INITIAL_DISTANCE_MPC,
          ...orbitAnglesLookingAlong(GALACTIC_DISC_FORWARD, frameBasis),
        }
      : bodyHomePose(home.focus.ref.id, simDays, fovYRad, frameBasis);
  // `target` copied: the framing's array is mutable and the commit must own its own.
  return absoluteArm({
    target: [pose.target[0], pose.target[1], pose.target[2]],
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
  });
}
