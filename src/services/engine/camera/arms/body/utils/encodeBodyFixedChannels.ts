/**
 * encodeBodyFixedChannels — `decodeBodyFixedChannels`'s inverse: a body-fixed pose as animation
 * channels in its body's fixed axes, the target `rangeM` ahead of the eye along the view axis.
 * Any positive range names the same eye and basis; it is the leg's log-space distance end.
 */
import type { BodyFixedPose } from '../../../../../../@types/camera/pose/BodyFixedPose';
import type { CameraPose } from '../../../../../../@types/camera/pose/CameraPose';
import type { Vec3 } from '../../../../../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../../../../../data/camera/bodyLocalFrame';
import { bodyFixedEyeM } from '../../../../../../utils/camera/surfaceFrame/bodyFixedEyeM';
import { orbitAnglesLookingAlong } from '../../../../../../utils/camera/orbitPose/orbitAnglesLookingAlong';
import { rollFromScreenUp } from '../../../../../../utils/camera/orbitPose/rollFromScreenUp';

export function encodeBodyFixedChannels(pose: BodyFixedPose, rangeM: number): CameraPose {
  const eye = bodyFixedEyeM(pose);
  const m = pose.basisLocal;
  const forward: Vec3 = [m[6], m[7], m[8]];
  const { yaw, pitch } = orbitAnglesLookingAlong(forward);
  return {
    target: [
      eye[0] + forward[0] * rangeM,
      eye[1] + forward[1] * rangeM,
      eye[2] + forward[2] * rangeM,
    ],
    yaw,
    pitch,
    distance: rangeM,
    roll: rollFromScreenUp(forward, [m[3], m[4], m[5]], BODY_LOCAL_FRAME.pole),
  };
}
