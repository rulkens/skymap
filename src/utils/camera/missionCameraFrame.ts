/**
 * missionCameraFrame — the mission camera's geometry at `simDays` before the visitor's offsets:
 * aim at the mission frame's centre, look along its normal, stand back far enough that the
 * frame's sphere fits. Null when a body the frame needs has no position.
 */

import type { CameraMission } from '../../@types/camera/CameraMission';
import type { MissionCameraFrame } from '../../@types/camera/MissionCameraFrame';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { missionFrame } from '../exhibits/mission/missionFrame';
import { missionNormal } from '../exhibits/mission/missionNormal';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { sphereFitDistance } from './sphereFitDistance';
import { yawPitchToDir } from './yawPitchToDir';

export function missionCameraFrame(
  mission: CameraMission,
  simDays: number,
  positionOf: (id: string) => Readonly<Vec3> | undefined,
  fovYRad: number,
  aspect: number,
  poseBasis: Readonly<Mat3>,
): MissionCameraFrame | null {
  const frame = missionFrame(mission.stops, mission.craftId, simDays, positionOf);
  if (frame === null) return null;
  // `yawPitchToDir` points from the target toward the eye; the camera looks the other way.
  const back = rotateVec3ByTightMat3(
    yawPitchToDir(mission.cruise.yaw, mission.cruise.pitch),
    poseBasis,
  );
  const normal = missionNormal(frame, [-back[0], -back[1], -back[2]]);
  // The orbit camera's own up, so the visitor's yaw turns about screen-up; its sideways axis
  // stands in where the normal runs along up and the cross degenerates.
  const camUp: Vec3 = [poseBasis[3], poseBasis[4], poseBasis[5]];
  const camSide: Vec3 = [poseBasis[0], poseBasis[1], poseBasis[2]];
  const helper = Math.abs(dot3(normal, camUp)) < 0.99 ? camUp : camSide;
  const right = normalize3(cross3(normal, helper));
  const up = cross3(right, normal);
  return {
    aim: frame.aim,
    normal,
    right,
    up,
    distance: sphereFitDistance(frame.radiusMpc, fovYRad, aspect),
  };
}
