/**
 * homePose — the committed pose of a composition's home: its body's home
 * framing at `simDays`, or the neutral pose for a home-less composition.
 * `frameBasis` is the committed orientation basis the angles encode through.
 */

import { computeInitialCamera } from './cameraFraming';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import type { EngineHomeConfig } from '../../../@types/engine/EngineHomeConfig';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';

export function homePose(
  home: EngineHomeConfig,
  fovYRad: number,
  simDays: number,
  frameBasis: Mat3,
): FramedCameraPose {
  const cam = computeInitialCamera({
    bodyId: home.focus === null ? null : home.focus.ref.id,
    fovYRad,
    simDays,
    frameBasis,
  });
  // `target` copied: the framing's array is mutable and the commit must own its own.
  return absoluteArm({
    target: [cam.target[0], cam.target[1], cam.target[2]],
    yaw: cam.yaw,
    pitch: cam.pitch,
    distance: cam.distance,
  });
}
